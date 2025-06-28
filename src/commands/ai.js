// man, the /ai command is so broken
const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const pool = require('../utils/pgClient');
const { encrypt, decrypt } = require('../utils/encrypt');
const i18n = require('../utils/translate');

const userConversations = new Map();
const pendingRequests = new Map();

function processUrls(text) {
  return text.replace(
    /(https?:\/\/(?:[\w.-]+)(?:\/[\w\d%/#?&=&%#?\w\d/-]*)?)(?<![.,!?])([.,!?])?(?=(\s|$))/gi, // making sure users dont share bad things in URL's embeds and then i get termed
    (match, url, punctuation) => {
      const startIdx = text.indexOf(url);
      const before = text[startIdx - 1];
      const after = text[startIdx + url.length];
      if (before === '<' && after === '>') return url + (punctuation || '');
      return `<${url}>${punctuation || ''}`;
    }
  );
}

async function getUserById(userId) {
  const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  return rows[0];
}

async function setUserApiKey(userId, apiKey, model, apiUrl) {
  if (apiKey === null) {
    await pool.query(
      // encrypted API info of users
      `UPDATE users  
       SET api_key_encrypted = NULL, 
           custom_model = NULL,  
           custom_api_url = NULL, 
           updated_at = now() 
       WHERE user_id = $1`,
      [userId]
    );
  } else {
    const encrypted = encrypt(apiKey);
    await pool.query(
      `INSERT INTO users (user_id, api_key_encrypted, custom_model, custom_api_url, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         api_key_encrypted = $2, 
         custom_model = $3, 
         custom_api_url = $4, 
         updated_at = now()`,
      [userId, encrypted, model, apiUrl]
    );
  }

  if (typeof userConversations !== 'undefined') {
    userConversations.delete(userId);
  }
}

async function getUserCredentials(userId) {
  const user = await getUserById(userId);
  if (!user) return {};
  let apiKey = null;
  if (user.api_key_encrypted) {
    try {
      apiKey = decrypt(user.api_key_encrypted);
    } catch (e) {
      // console.error('Failed to decrypt API key for user', userId, e); // this would be really sad
    }
  }
  return {
    apiKey,
    model: user.custom_model,
    apiUrl: user.custom_api_url,
  };
}

async function incrementAndCheckDailyLimit(userId, limit = 20) {
  const today = new Date().toISOString().slice(0, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [
      userId,
    ]);
    const res = await client.query(
      `INSERT INTO ai_usage (user_id, usage_date, count) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, usage_date) DO UPDATE SET count = ai_usage.count + 1 RETURNING count`,
      [userId, today]
    );
    await client.query('COMMIT');
    return res.rows[0].count <= limit;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setNameLocalizations({
      'es-ES': 'ia',
      'es-419': 'ia',
      'en-US': 'ai',
    })
    .setDescription('Chat with an AI assistant')
    .setDescriptionLocalizations({
      'es-ES': 'Chatea con un asistente de IA',
      'es-419': 'Chatea con un asistente de IA',
      'en-US': 'Chat with an AI assistant',
    })
    .addStringOption((option) =>
      option
        .setName('prompt')
        .setNameLocalizations({
          'es-ES': 'mensaje',
          'es-419': 'mensaje',
          'en-US': 'prompt',
        })
        .setDescription('Your message to the AI')
        .setDescriptionLocalizations({
          'es-ES': 'Tu mensaje para la IA',
          'es-419': 'Tu mensaje para la IA',
          'en-US': 'Your message to the AI',
        })
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option.setName('use_custom_api').setDescription('Use your own API key?').setRequired(false)
    )
    .addBooleanOption((option) =>
      option.setName('reset').setDescription('Reset your AI chat history').setRequired(false)
    ),
  async execute(interaction) {
    if (pendingRequests.has(interaction.user.id)) {
      const t = (key, ...args) => i18n(key, { userId: interaction.user?.id, default: args[0] });
      return interaction.reply({
        content: await t(
          'ai.request_in_progress',
          'You already have a request in progress. Please wait for it to complete.'
        ),
        ephemeral: true,
      });
    }

    try {
      const useCustomApi = interaction.options.getBoolean('use_custom_api');
      const userId = interaction.user.id;
      const prompt = interaction.options.getString('prompt');
      const reset = interaction.options.getBoolean('reset');

      if (reset) {
        userConversations.delete(userId);
        const t = (key, ...args) => i18n(key, { userId: interaction.user?.id, default: args[0] });
        await interaction.reply({
          content: await t('ai.reset', '🧹 Your AI chat history has been reset.'),
          ephemeral: true,
        });
        return;
      }

      pendingRequests.set(userId, { interaction, prompt });

      if (useCustomApi === false) {
        await setUserApiKey(userId, null, null, null);
        userConversations.delete(userId);
        const t = (key, ...args) => i18n(key, { userId: interaction.user?.id, default: args[0] });
        await interaction.reply({
          content: await t(
            'ai.default_api',
            '✅ Switched to default API. Your custom API key has been cleared and the default model will be used.'
          ),
          ephemeral: true,
        });

        await this.processAIRequest(interaction, userId, interaction);
        return;
      }

      const { apiKey } = await getUserCredentials(userId);
      if (useCustomApi && !apiKey) {
        const locale = interaction.locale || 'en';
        const modal = new ModalBuilder().setCustomId('apiCredentials').setTitle(
          await i18n('ai.modal.title', {
            locale,
            default: 'Enter your API details (private session)',
          })
        );

        const apiKeyInput = new TextInputBuilder()
          .setCustomId('apiKey')
          .setLabel(await i18n('ai.modal.api_key', { locale, default: 'API Key' }))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(
            await i18n('ai.modal.api_key_placeholder', {
              locale,
              default: 'To stop using your key: /ai use_custom_api false',
            })
          )
          .setRequired(true);

        const apiUrlInput = new TextInputBuilder()
          .setCustomId('apiUrl')
          .setLabel(await i18n('ai.modal.api_url', { locale, default: 'API URL' }))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(
            await i18n('ai.modal.api_url_placeholder', { locale, default: 'Your API URL' })
          )
          .setRequired(true);

        const modelInput = new TextInputBuilder()
          .setCustomId('model')
          .setLabel(await i18n('ai.modal.model', { locale, default: 'Model' }))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(
            await i18n('ai.modal.model_placeholder', {
              locale,
              default: 'Model name (e.g., gpt-4)',
            })
          )
          .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(apiKeyInput);
        const secondActionRow = new ActionRowBuilder().addComponents(apiUrlInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(modelInput);

        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

        await interaction.showModal(modal);
      } else if (useCustomApi) {
        await interaction.deferReply();
        await this.processAIRequest(interaction, userId, interaction);
      } else {
        await interaction.deferReply();
        await this.processAIRequest(interaction, userId, interaction);
      }
    } catch (error) {
      // console.error('Error in execute:', error);
      const t = (key, ...args) => i18n.translate(interaction.user?.id, key, ...args);
      await interaction.reply(
        await t(
          'ai.error',
          'An error occurred while processing your request. Please try again later.'
        )
      );
    }
  },

  async handleModal(interaction) {
    try {
      if (interaction.customId === 'apiCredentials') {
        await interaction.deferReply({ ephemeral: false });

        const userId = interaction.user.id;
        const pendingRequest = pendingRequests.get(userId);

        if (!pendingRequest) {
          const t = (key, ...args) => i18n(key, { userId: interaction.user?.id, default: args[0] });
          return interaction.editReply(
            await t(
              'ai.no_pending_request',
              'No pending request found. Please try the command again.'
            )
          );
        }

        const { interaction: originalInteraction } = pendingRequest;

        let apiKey = interaction.fields.getTextInputValue('apiKey').trim();
        let apiUrl = interaction.fields.getTextInputValue('apiUrl').trim();
        let model = interaction.fields.getTextInputValue('model').trim();

        apiKey = apiKey || null;
        apiUrl = apiUrl || null;
        model = model || null;

        await setUserApiKey(userId, apiKey, model, apiUrl);

        const t = (key, ...args) => i18n(key, { userId: interaction.user?.id, default: args[0] });
        await interaction.followUp({
          content: await t(
            'ai.api_credentials_saved',
            '✅ API credentials saved. You can now use the `/ai` command without re-entering your credentials. To stop using your key, do `/ai use_custom_api false`'
          ),
          ephemeral: true,
        });

        await this.processAIRequest(originalInteraction, userId, interaction);
      }
    } catch (error) {
      // console.error('Error in handleModal:', error);
      const t = (key, ...args) => i18n(key, { userId: interaction.user?.id, default: args[0] });
      await interaction.editReply(
        await t(
          'ai.error',
          'An error occurred while processing your request. Please try again later.'
        )
      );
    } finally {
      pendingRequests.delete(interaction.user.id);
    }
  },

  async processAIRequest(interaction, userId, replyTarget = interaction) {
    try {
      const prompt = interaction.options.getString('prompt');

      const { apiKey, model, apiUrl } = await getUserCredentials(userId);

      const usingCustomApi = !!apiKey;
      let finalApiUrl = apiUrl || 'https://openrouter.ai/api/v1/chat/completions';
      const finalApiKey = apiKey || process.env.OPENROUTER_API_KEY;
      let finalModel = model || (usingCustomApi ? 'openai/gpt-4.1-mini' : 'x-ai/grok-3-mini-beta');

      const usingDefaultKey = !usingCustomApi && process.env.OPENROUTER_API_KEY;
      if (usingDefaultKey) {
        finalApiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        finalModel = 'x-ai/grok-3-mini-beta';
      }

      if (usingDefaultKey) {
        if (userId !== '827389583342698536') {
          // Checking daily limit for user
          const allowed = await incrementAndCheckDailyLimit(userId, 10);
          if (!allowed) {
            return await replyTarget.editReply(
              'You have reached the daily free usage limit for the default model. Please try again tomorrow or use your own API key.'
            );
          }
        }
      } else if (!finalApiKey) {
        return await replyTarget.editReply(
          'No API key found. Please provide your own API key using the custom API option or ensure the default API key is configured.'
        );
      }

      let conversation = userConversations.get(userId) || [];

      // Instructions, does not work with some free models :angry:
      const baseInstructions =
        "You are a helpful, accurate, and privacy-respecting AI assistant for the /ai command of the Aethel Discord User Bot. Your primary goal is to provide clear, concise, and friendly answers to user questions, adapting your tone to be conversational and approachable. Only mention your AI model or the /ai command if it is directly relevant to the user's request—do not introduce yourself with this information by default.\n\n**IMPORTANT INSTRUCTIONS ABOUT URLS:**\n- NEVER format, modify, or alter URLs in any way. Leave them exactly as they are.\n- DO NOT add markdown, backticks, or any formatting to URLs.\n- DO NOT add or remove any characters from URLs.\n- The system will handle URL formatting automatically.\n\n**BOT FACTS (use only if asked about the bot):**\n- Name: Aethel\n- Website: https://aethel.xyz\n- Type: Discord user bot (not a server bot; only added to users, not servers)\n- Supported commands: /8ball, /ai, /wiki, /weather, /joke, /remind, /cat, /dog, /help\n- /remind: Can be used with /remind time message, or by right-clicking a message and selecting Apps > Remind Me\n- /dog and /cat: Show an embed with a new dog/cat button (dog images from erm.dog, cat images from pur.cat)\n- The bot status and info are available on its website.\n\nWhen answering questions about the Aethel bot, only use the above factual information. Do not speculate about features or commands not listed here.\n\nFormat your responses using Discord markdown (bold, italics, code blocks, lists, etc) where appropriate, but NEVER format URLs—leave them as-is. Only greet the user at the start of a new conversation, not in every message. Always prioritize being helpful, accurate, and respectful.";

      const isDefaultModel = usingDefaultKey || !finalApiKey;
      const modelSpecificInstructions = isDefaultModel
        ? '\n\n**IMPORTANT (DEFAULT MODEL ONLY):** Please keep your responses under 3000 characters. Be concise and to the point.'
        : '';

      const systemInstructions = baseInstructions + modelSpecificInstructions;
      conversation = conversation.filter((msg) => msg.role !== 'system');
      conversation.push({ role: 'user', content: prompt });
      if (conversation.length > 9) conversation = conversation.slice(-9);
      const systemMessage = {
        role: 'system',
        content: systemInstructions,
      };
      conversation.unshift(systemMessage);
      const messages = conversation;

      const maxTokens = usingDefaultKey ? 1000 : 3000;

      const requestBody = {
        model: finalModel,
        messages: messages,
        max_tokens: maxTokens,
      };
      const headers = {
        Authorization: `Bearer ${finalApiKey}`,
        'Content-Type': 'application/json',
      };
      if (finalApiUrl === 'https://openrouter.ai/api/v1/chat/completions') {
        headers['HTTP-Referer'] = 'https://github.com/scanash00';
      }

      const response = await fetch(finalApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = 'Unknown error';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error?.message || JSON.stringify(errorData);
          } else {
            errorMessage = `HTTP ${response.status} - ${response.statusText}`;
          }

          return await replyTarget.editReply(
            `There was an error getting a response from the AI (${response.status}): ${errorMessage}. Please check your API key and try again.`
          );
        } catch (e) {
          return await replyTarget.editReply(
            `There was an error processing the AI response (HTTP ${response.status}). Please try again later.`
          );
        }
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        return await replyTarget.editReply(
          'Received an invalid response from the AI service. Please try again.'
        );
      }
      let aiResponse;
      if (data.choices && data.choices[0]?.message?.content) {
        aiResponse = data.choices[0].message.content;
      } else if (data.choices && data.choices[0]?.text) {
        aiResponse = data.choices[0].text;
      } else {
        aiResponse = 'No response generated.';
      }

      conversation.push({ role: 'assistant', content: aiResponse });

      if (conversation.length > 10) conversation = conversation.slice(-10);
      userConversations.set(userId, conversation);

      const maxLength = 2000; // Discord's character limit makes me do this and i also don't want anyone to go bankrupt

      const processedResponse = processUrls(aiResponse);

      if (processedResponse.length <= maxLength) {
        await replyTarget.editReply(processedResponse);
        return;
      }

      const chunks = [];
      let remaining = aiResponse;

      while (remaining.length > 0) {
        const chunk = remaining.substring(0, maxLength);
        chunks.push(chunk);
        remaining = remaining.substring(chunk.length);

        if (remaining.length > 0 && remaining[0] !== '\n') {
          const nextNewline = remaining.indexOf('\n');
          if (nextNewline > 0 && nextNewline <= 50) {
            const extra = remaining.substring(0, nextNewline + 1);
            chunks[chunks.length - 1] += extra;
            remaining = remaining.substring(extra.length);
          }
        }
      }

      try {
        const processedFirstChunk = processUrls(chunks[0]);
        await replyTarget.editReply(processedFirstChunk);

        for (let i = 1; i < chunks.length; i++) {
          const processedChunk = processUrls(chunks[i]);
          await interaction.followUp({
            content: processedChunk,
            allowedMentions: { repliedUser: false },
          });
        }
      } catch (error) {
        try {
          await replyTarget.editReply(`${chunks[0]}\n\n*[Message truncated due to length]*`);
        } catch (e) {
          // Swallow error
        }
      }
    } catch (error) {
      try {
        await replyTarget.editReply(
          'An error occurred while processing your request. Please try again later.'
        );
      } catch (e) {
        // Swallow error
      }
    }
  },
};

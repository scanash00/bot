import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import whois from 'whois-json';
import { isIP } from 'net';
import { sanitizeInput, isValidDomain } from '../utils/validation.js';
import logger from '../utils/logger.js';

const cooldowns = new Map();
const COOLDOWN_TIME = 10000;
const CACHE_TTL = 3600000;
const MAX_RETRIES = 2;
const INITIAL_TIMEOUT = 5000;
const cache = new Map();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(fn, maxRetries = MAX_RETRIES, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (
        error.message.includes('No WHOIS data available') ||
        error.message.includes('Unsupported TLD')
      ) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delayMs = baseDelay * Math.pow(2, attempt);
        logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`, {
          error: error.message,
        });
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}

const KNOWN_WHOIS_SERVERS = {
  com: ['whois.verisign-grs.com', 'whois.crsnic.net'],
  net: ['whois.verisign-grs.com', 'whois.crsnic.net'],
  org: ['whois.pir.org', 'whois.publicinterestregistry.org'],
  io: ['whois.nic.io', 'whois.nic.io'],
  dev: ['whois.nic.google', 'whois.nic.google'],
  app: ['whois.nic.google', 'whois.nic.google'],
  ai: ['whois.nic.ai', 'whois.nic.ai'],
  co: ['whois.nic.co', 'whois.nic.co'],
  cat: ['whois.nic.cat', 'whois.nic.cat'],
  uk: ['whois.nic.uk', 'whois.nominet.org.uk'],
  de: ['whois.denic.de', 'whois.denic.de'],
  fr: ['whois.nic.fr', 'whois.nic.fr'],
  nl: ['whois.domain-registry.nl', 'whois.sidn.nl'],
  eu: ['whois.eu', 'whois.eurid.eu'],
  ca: ['whois.cira.ca', 'whois.cira.ca'],
  au: ['whois.auda.org.au', 'whois.ausregistry.net.au'],
  nz: ['whois.srs.net.nz', 'whois.dnc.org.nz'],
  jp: ['whois.jprs.jp', 'whois.jprs.jp'],
  cn: ['whois.cnnic.cn', 'whois.cnnic.net.cn'],
  ru: ['whois.tcinet.ru', 'whois.ripn.net'],
  br: ['whois.registro.br', 'whois.registro.br'],
  in: ['whois.registry.in', 'whois.registry.in'],
  me: ['whois.nic.me', 'whois.nic.me'],
  tv: ['whois.nic.tv', 'tvwhois.verisign-grs.com'],
  us: ['whois.nic.us', 'whois.nic.us'],
  biz: ['whois.biz', 'whois.neulevel.biz'],
  info: ['whois.afilias.net', 'whois.afilias.info'],
  moe: ['whois.nic.moe', 'whois.nic.moe'],
  xyz: ['whois.nic.xyz', 'whois.nic.xyz'],
  online: ['whois.nic.online', 'whois.nic.online'],
  site: ['whois.nic.site', 'whois.nic.site'],
  store: ['whois.nic.store', 'whois.nic.store'],
  tech: ['whois.nic.tech', 'whois.nic.tech'],
  club: ['whois.nic.club', 'whois.nic.club'],
  guru: ['whois.nic.guru', 'whois.nic.guru'],
  lol: ['whois.nic.lol', 'whois.nic.lol'],
};

const SPECIAL_TLDS = {
  dev: {
    servers: ['whois.nic.google'],
    requiresKey: true,
    message: 'Google Domains may require authentication for WHOIS lookups.',
  },
  app: {
    servers: ['whois.nic.google'],
    requiresKey: true,
    message: 'Google Domains may require authentication for WHOIS lookups.',
  },
};

function getWhoisServers(domain) {
  const domainParts = domain.split('.').filter(Boolean);
  const tld = domainParts.length > 1 ? domainParts[domainParts.length - 1].toLowerCase() : '';
  const sld = domainParts.length > 2 ? domainParts[domainParts.length - 2].toLowerCase() : '';

  if (SPECIAL_TLDS[tld]) {
    return {
      servers: SPECIAL_TLDS[tld].servers,
      message: SPECIAL_TLDS[tld].message,
    };
  }

  if (KNOWN_WHOIS_SERVERS[tld]) {
    return {
      servers: Array.isArray(KNOWN_WHOIS_SERVERS[tld])
        ? KNOWN_WHOIS_SERVERS[tld]
        : [KNOWN_WHOIS_SERVERS[tld]],
      message: null,
    };
  }

  return {
    servers: [`whois.nic.${tld}`, `whois.${tld}`, `whois.${sld}.${tld}`, 'whois.iana.org'],
    message: 'Using fallback WHOIS server. Results may be limited.',
  };
}

async function isServerReachable(server) {
  try {
    const { Resolver } = await import('dns').then((module) => module.promises);
    const resolver = new Resolver();
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
    await resolver.resolve4(server);
    return true;
  } catch (error) {
    logger.debug(`Server ${server} is not reachable:`, error.message);
    return false;
  }
}

function formatWhoisData(data) {
  try {
    if (typeof data === 'string') {
      return formatRawWhoisData(data);
    }

    if (data?.raw) {
      return formatRawWhoisData(data.raw);
    }

    if (data?.text) {
      return formatRawWhoisData(data.text);
    }

    if (data?.whoisData?.raw) {
      return formatRawWhoisData(data.whoisData.raw);
    }

    if (typeof data === 'object' && data !== null) {
      const sections = [];
      const fieldMapping = {
        domainName: { display: 'Domain Name', section: 'domain' },
        registryDomainId: { display: 'Registry ID', section: 'domain' },
        registryExpiryDate: { display: 'Expiration Date', section: 'dates' },
        creationDate: { display: 'Created On', section: 'dates' },
        updatedDate: { display: 'Last Updated', section: 'dates' },
        domainStatus: { display: 'Status', section: 'domain' },
        dnssec: { display: 'DNSSEC', section: 'domain' },
        nameServer: { display: 'Name Servers', section: 'domain' },

        registrar: { display: 'Registrar', section: 'registrar' },
        registrarIanaId: { display: 'IANA ID', section: 'registrar' },
        registrarWhoisServer: { display: 'WHOIS Server', section: 'registrar' },
        registrarUrl: { display: 'Website', section: 'registrar' },
        registrarAbuseContactEmail: { display: 'Abuse Contact', section: 'registrar' },
        registrarAbuseContactPhone: { display: 'Abuse Phone', section: 'registrar' },

        registrantEmail: { display: 'Email', section: 'registrant' },
        adminEmail: { display: 'Admin Email', section: 'admin' },
        techEmail: { display: 'Tech Email', section: 'tech' },
        billingEmail: { display: 'Billing Email', section: 'billing' },
      };

      const formatDate = (dateStr) => {
        try {
          const date = new Date(dateStr);
          return !isNaN(date) ? date.toLocaleString() : dateStr;
        } catch {
          return dateStr;
        }
      };

      const sectionTitles = {
        domain: '🌐 Domain Information',
        dates: '📅 Important Dates',
        registrar: '🏢 Registrar',
        registrant: '👤 Registrant',
        admin: '👨‍💼 Admin',
        tech: '🔧 Technical',
        billing: '💳 Billing',
      };

      const sectionData = {};
      Object.keys(sectionTitles).forEach((section) => {
        sectionData[section] = [];
      });

      for (const [key, field] of Object.entries(fieldMapping)) {
        if (data[key] && !data[key].includes('DATA REDACTED')) {
          let value = data[key];

          if (key.toLowerCase().includes('date')) {
            value = formatDate(value);
          }

          if (key === 'nameServer' && typeof value === 'string') {
            value = value
              .split(' ')
              .map((ns) => `• \`${ns}\``)
              .join('\n');
          }

          if (key.endsWith('Email')) {
            if (value && value.startsWith('http')) {
              value = `[Click to contact](${value})`;
            } else if (value) {
              value = `[${value}](mailto:${value})`;
            }
          }

          if (key === 'domainName') {
            sectionData[field.section].push(`**${value}**`);
          } else if (key === 'nameServer') {
            sectionData[field.section].push(`**${field.display}**\n${value}`);
          } else {
            sectionData[field.section].push(`**${field.display}:** ${value}`);
          }
        }
      }

      const excludedFields = [
        'termsOfUse',
        'lastUpdateOfWhoisDatabase',
        'urlOfTheIcannWhoisDataProblemReportingSystem',
      ];

      for (const [key, value] of Object.entries(data)) {
        if (
          !fieldMapping[key] &&
          value &&
          typeof value === 'string' &&
          !key.toLowerCase().includes('name') &&
          !key.toLowerCase().includes('phone') &&
          !key.toLowerCase().includes('address') &&
          !key.toLowerCase().includes('city') &&
          !key.toLowerCase().includes('state') &&
          !key.toLowerCase().includes('postal') &&
          !key.toLowerCase().includes('country') &&
          !key.toLowerCase().includes('fax') &&
          !excludedFields.includes(key) &&
          !value.includes('DATA REDACTED')
        ) {
          sectionData.domain.push(`**${key.split(/(?=[A-Z])/).join(' ')}:** ${value}`);
        }
      }

      for (const [section, title] of Object.entries(sectionTitles)) {
        if (sectionData[section] && sectionData[section].length > 0) {
          sections.push(`**${title}**\n${sectionData[section].join('\n')}`);
        }
      }

      sections.push(`_Last updated: ${new Date().toLocaleString()}_`);

      return sections.join('\n\n');
    }

    return formatRawWhoisData(JSON.stringify(data, null, 2));
  } catch (error) {
    // console.error('Error formatting WHOIS data:', error);
    return '```\nError formatting WHOIS data. Please check the logs for details.\n```';
  }
}

function formatRawWhoisData(rawData) {
  if (!rawData) return '```\nNo WHOIS data available\n```';

  const cleanedLines = rawData
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith('%') &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('For more information') &&
        !trimmed.startsWith('>>>') &&
        !trimmed.startsWith('NOTICE:') &&
        !trimmed.includes('urlOfTheIcannWhoisInaccuracyComplaintForm') &&
        !trimmed.includes('lastUpdateOfWhoisDatabase') &&
        !trimmed.includes('termsOfUse')
      );
    });

  const maxLength = 1900;
  const joined = cleanedLines.join('\n');

  if (joined.length <= maxLength) {
    return `\`\`\`\n${joined}\`\`\``;
  }

  return `\`\`\`\n${joined.substring(0, maxLength - 3)}...\`\`\``;
}

async function getWhoisData(query) {
  const cacheKey = query.toLowerCase();
  const now = Date.now();

  if (cache.has(cacheKey)) {
    const { data, timestamp } = cache.get(cacheKey);
    if (now - timestamp < CACHE_TTL) {
      return data;
    }
  }

  const performLookup = async () => {
    const isIp = isIP(query);

    if (isIp) {
      return await performWhoisLookup(query, {
        server: 'whois.arin.net',
        follow: 1,
        timeout: INITIAL_TIMEOUT,
        format: 'json',
      });
    }

    const { servers } = getWhoisServers(query);

    for (const server of servers) {
      try {
        if (!(await isServerReachable(server))) {
          continue;
        }

        return await performWhoisLookup(query, {
          server,
          follow: 1,
          timeout: INITIAL_TIMEOUT,
          format: 'json',
        });
      } catch (error) {
        continue;
      }
    }

    throw new Error(
      'Could not retrieve WHOIS information. The domain may not exist or the WHOIS server may be temporarily unavailable.'
    );
  };

  async function performWhoisLookup(query, options) {
    try {
      let result = await whois(query, options);

      if (!result || Object.keys(result).length === 0) {
        const rawResult = await whois.raw(query, {
          ...options,
          format: 'raw',
          follow: 0,
        });

        if (rawResult) {
          result = { raw: rawResult };
        }
      }

      if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
        throw new Error('No WHOIS data available for this domain');
      }

      return result;
    } catch (error) {
      if (
        error.code !== 'ENOTFOUND' &&
        error.code !== 'ECONNREFUSED' &&
        error.code !== 'ETIMEDOUT'
      ) {
        logger.error(`Unexpected error in WHOIS lookup for ${query}:`, error);
      }
      throw error;
    }
  }

  try {
    const result = await withRetry(performLookup);

    cache.set(cacheKey, { data: result, timestamp: now });

    return result;
  } catch (error) {
    logger.error(`All WHOIS lookup attempts failed for ${query}:`, error);

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error(
        'The WHOIS server is not responding. This may be due to server restrictions or network issues.'
      );
    } else if (error.code === 'ETIMEDOUT' || error.name === 'AbortError') {
      throw new Error(
        'The WHOIS server took too long to respond. Please try again later or check the domain name.'
      );
    } else if (
      error.message.includes('No WHOIS data available') ||
      error.message.includes('not found') ||
      error.message.includes('no match')
    ) {
      throw new Error(
        'No WHOIS data available for this domain. It may be registered with a privacy service or the domain may not exist.'
      );
    } else if (
      error.message.includes('Unsupported TLD') ||
      error.message.includes('invalid domain')
    ) {
      throw new Error('Unsupported domain extension. Please check the domain name and try again.');
    } else if (error.message.includes('All WHOIS servers for this domain failed to respond')) {
      throw new Error(
        'Unable to find a working WHOIS server for this domain. The domain may be using a private registration.'
      );
    } else {
      throw new Error(`Failed to fetch WHOIS data: ${error.message}`);
    }
  }
}

const command = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setNameLocalizations({
      'es-ES': 'quien',
      'es-419': 'quien',
    })
    .setDescription('Look up WHOIS information for a domain or IP address')
    .setDescriptionLocalizations({
      'es-ES': 'Buscar información WHOIS de un dominio o dirección IP',
      'es-419': 'Buscar información WHOIS de un dominio o dirección IP',
    })
    .addStringOption((option) =>
      option
        .setName('query')
        .setNameLocalizations({
          'es-ES': 'consulta',
          'es-419': 'consulta',
        })
        .setDescription('Domain or IP address to look up')
        .setDescriptionLocalizations({
          'es-ES': 'Dominio o dirección IP a buscar',
          'es-419': 'Dominio o dirección IP a buscar',
        })
        .setRequired(true)
    ),

  async execute(interaction) {
    const now = Date.now();
    const cooldown = cooldowns.get(interaction.user.id);

    if (cooldown && now - cooldown < COOLDOWN_TIME) {
      const timeLeft = Math.ceil((COOLDOWN_TIME - (now - cooldown)) / 1000);
      return interaction.reply({
        content: `⏳ Please wait ${timeLeft} seconds before using this command again.`,
        ephemeral: true,
      });
    }

    cooldowns.set(interaction.user.id, now);

    const query = interaction.options.getString('query').trim();
    const sanitizedQuery = sanitizeInput(query);

    if (!isValidDomain(query) && !isIP(query)) {
      return interaction.reply({
        content: '❌ Please provide a valid domain name or IP address.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const whoisData = await getWhoisData(sanitizedQuery);

      if (!whoisData) {
        return interaction.editReply({
          content: '❌ No WHOIS data found for the specified domain or IP.',
        });
      }

      const formattedData = formatWhoisData(whoisData);

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`🔍 WHOIS Lookup: ${sanitizedQuery}`)
        .setDescription(formattedData)
        .setFooter({ text: 'WHOIS data provided by whois-json' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error in whois command for ${sanitizedQuery}:`, error);

      await interaction.editReply({
        content: `❌ Error: ${error.message || 'An error occurred while fetching WHOIS data.'}`,
      });
    }
  },
};

export default command;

// parsing the response hurts

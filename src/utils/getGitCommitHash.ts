import { execSync } from 'child_process';

function getGitCommitHash() {
  if (process.env.SOURCE_COMMIT) {
    return process.env.SOURCE_COMMIT.substring(0, 7);
  }

  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch (error) {
    // console.error('Error getting git commit hash:', error);
    return process.env.NODE_ENV === 'production' ? 'production' : 'development';
  }
}

export default getGitCommitHash;

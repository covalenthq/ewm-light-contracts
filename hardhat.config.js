require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');
require('hardhat-gas-reporter');
require('hardhat-abi-exporter');
require('solidity-coverage');
require('hardhat-contract-sizer');
require('@openzeppelin/hardhat-defender');
require('@nomiclabs/hardhat-etherscan');

const bnetworks = {
  hardhat: {
    chainId: 1,
    forking: {
      url: process.env.ERIGON_NODE,
      blockNumber: 13182263,
    },
    allowUnlimitedContractSize: true,
    blockGasLimit: 0x1fffffffffffff,
  },
  test: {
    url: 'http://0.0.0.0:8545/',
    allowUnlimitedContractSize: true,
    gas: 114477379374,
    blockGasLimit: 0x1fffffffffffff,
  },
  // sepolia: {
  //   url: process.env.SEPOLIA_NODE,
  //   chainId: 11155111,
  //   accounts: [
  //     process.env.EWM_CONTRACTS_DEPLOYER,
  //     process.env.EWM_CLAIM_ADMIN_PK,
  //     process.env.EWM_TOKEN_HOLDER_1,
  //     process.env.EWM_TOKEN_HOLDER_2,
  //     process.env.EWM_TOKEN_HOLDER_3,
  //     process.env.EWM_REWARD_MANAGER_PK,
  //   ],
  // },
  // baseSepolia: {
  //   url: process.env.BASE_SEPOLIA_NODE,
  //   chainId: 84532,
  //   accounts: [
  //     process.env.EWM_CONTRACTS_DEPLOYER,
  //     process.env.EWM_CLAIM_ADMIN_PK,
  //     process.env.EWM_TOKEN_HOLDER_1,
  //     process.env.EWM_TOKEN_HOLDER_2,
  //     process.env.EWM_TOKEN_HOLDER_3,
  //     process.env.EWM_REWARD_MANAGER_PK,
  //   ],
  // },
  // baseMainnet: {
  //   url: process.env.BASE_MAINNET_NODE,
  //   chainId: 8453,
  //   accounts: [
  //     process.env.EWM_PROD_CONTRACTS_DEPLOYER,
  //     process.env.EWM_PROD_CLAIM_ADMIN_PK,
  //     process.env.EWM_TOKEN_HOLDER_1,
  //     process.env.EWM_TOKEN_HOLDER_2,
  //     process.env.EWM_TOKEN_HOLDER_3,
  //     process.env.EWM_PROD_REWARD_MANAGER_PK,
  //   ],
  // },
};

// Remove Sepolia network if the TEST_ENV flag is set
if (process.env.TEST_ENV) {
  delete bnetworks.sepolia;
}

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  defender: {
    apiKey: process.env.DEFENDER_API_KEY,
    apiSecret: process.env.DEFENDER_SECRET_KEY,
  },
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
    },
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 21,
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
    '@openzeppelin/contracts': './node_modules/@openzeppelin/contracts',
  },
  mocha: {
    timeout: 600000, // 10 minutes in milliseconds
  },
  abiExporter: [
    {
      path: './generated-abis/ugly',
      clear: true,
      flat: true,
      spacing: 2,
    },
    {
      path: './generated-abis/pretty',
      pretty: true,
    },
  ],
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: [':ProofChain$'],
  },
  defaultNetwork: 'hardhat',
  networks: bnetworks,
  etherscan: {
    apiKey: {
      moonbeam: process.env.MOONBEAM_SCAN_API_KEY, // Moonbeam Moonscan API Key
      moonbaseAlpha: process.env.MOONBEAM_SCAN_API_KEY, // Moonbeam Moonscan API Key
      sepolia: process.env.ETHERSCAN_API_KEY,
      baseSepolia: process.env.BASE_SEPOLIA_SCAN_API_KEY,
      baseMainnet: process.env.BASE_MAINNET_SCAN_API_KEY,
    },
    customChains: [
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia-explorer.base.org',
        },
      },
      {
        network: 'baseMainnet',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://base.blockscout.com/',
        },
      },
    ],
  },
};

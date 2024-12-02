const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();
const { oneToken } = require('../test/helpers');

async function depositRewards() {
  const [owner] = await ethers.getSigners();

  console.log('Depositing rewards with the account:', owner.address);
  console.log('Account balance:', (await owner.getBalance()).toString());

  // Get addresses from environment variables
  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;
  const CXT_ADDRESS = process.env.BASE_SEPOLIA_CXT_FAUCET;

  // Ensure the required environment variables are set
  if (!NFT_CONTROLLER_ADDRESS || !CXT_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('NFT Controller Address:', NFT_CONTROLLER_ADDRESS);
  console.log('CXT Address:', CXT_ADDRESS);

  // Get the NFT Controller contract instance
  const EwmNftController = await hre.ethers.getContractFactory('EwmNftController');
  const nftController = await EwmNftController.attach(NFT_CONTROLLER_ADDRESS);

  // Get the CXT token contract instance
  const CXT = await hre.ethers.getContractFactory('CovalentXTokenFaucet');
  const cxtToken = await CXT.attach(CXT_ADDRESS);

  // Amount of tokens to deposit (e.g., 10 MIO based on 25% APY for  CXT 10K LCs)
  const depositAmount = oneToken.mul(10000000);

  console.log('Approving CXT transfer...');
  await cxtToken.connect(owner).approve(NFT_CONTROLLER_ADDRESS, depositAmount);

  console.log('Depositing reward tokens...');
  await nftController.connect(owner).depositRewardTokens(depositAmount);

  console.log('Reward tokens deposited successfully');

  // Get the contract metadata
  const metadata = await nftController.getMetadata();
  console.log('Contract Metadata:', metadata);

  // Check if rewardPool exists and is a BigNumber
  if (metadata._rewardPool && ethers.BigNumber.isBigNumber(metadata._rewardPool)) {
    console.log('New reward balance:', ethers.utils.formatUnits(metadata._rewardPool, 18), 'CXT');
  } else {
    console.log('Reward pool balance:', metadata._rewardPool);
  }
}

async function main() {
  try {
    await hre.run('compile');
    await depositRewards();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();

async function getMetadata() {
  const [deployer] = await ethers.getSigners();

  console.log('Getting metadata with the account:', deployer.address);
  console.log('Account balance:', (await deployer.getBalance()).toString());

  // Get addresses from environment variables
  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;
  const NFT_CLAIM_ADDRESS = process.env.BASE_SEPOLIA_NFT_CLAIM;
  const NFT_ALLOWANCE_ADDRESS = process.env.BASE_SEPOLIA_NFT_ALLOWANCE;
  const CXT_TOKEN_ADDRESS = process.env.BASE_SEPOLIA_CXT_FAUCET;

  // Ensure the required environment variables are set
  if (!NFT_CONTROLLER_ADDRESS || !NFT_CLAIM_ADDRESS || !NFT_ALLOWANCE_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('NFT Controller Address:', NFT_CONTROLLER_ADDRESS);
  console.log('NFT Claim Address:', NFT_CLAIM_ADDRESS);
  console.log('NFT Allowance Address:', NFT_ALLOWANCE_ADDRESS);

  // Get contract instances
  const EwmNftController = await hre.ethers.getContractFactory('EwmNftController');
  const nftController = await EwmNftController.attach(NFT_CONTROLLER_ADDRESS);

  const EwmNftClaim = await hre.ethers.getContractFactory('EwmNftClaim');
  const nftClaim = await EwmNftClaim.attach(NFT_CLAIM_ADDRESS);

  const EwmNftAllowance = await hre.ethers.getContractFactory('EwmNftAllowance');
  const nftAllowance = await EwmNftAllowance.attach(NFT_ALLOWANCE_ADDRESS);

  const CxtToken = await hre.ethers.getContractFactory('CovalentXTokenFaucet');
  const cxtToken = await CxtToken.attach(CXT_TOKEN_ADDRESS);
  // Get CXT balance of the controller contract
  const cxtBalanceController = await cxtToken.balanceOf(NFT_CONTROLLER_ADDRESS);
  const cxtBalanceAllowance = await cxtToken.balanceOf(NFT_ALLOWANCE_ADDRESS);

  console.log('\nGetting NFT Controller Metadata...');
  const controllerMetadata = await nftController.getMetadata();

  // Add CXT balance to the metadata
  const enhancedControllerMetadata = {
    ...controllerMetadata,
    cxtBalance: cxtBalanceController,
  };

  console.log('NFT Controller Metadata:', formatMetadata(enhancedControllerMetadata));

  console.log('\nGetting NFT Claim Metadata...');
  const claimMetadata = await nftClaim.getMetadata();
  console.log('NFT Claim Metadata:', formatMetadata(claimMetadata));

  console.log('\nGetting NFT Allowance Metadata...');
  const allowanceMetadata = await nftAllowance.getMetadata();
  const enhancedAllowanceMetadata = {
    ...allowanceMetadata,
    cxtBalance: cxtBalanceAllowance,
  };

  console.log('NFT Allowance Metadata:', formatMetadata(enhancedAllowanceMetadata));
}

function formatMetadata(metadata) {
  return Object.entries(metadata).reduce((acc, [key, value]) => {
    if (ethers.BigNumber.isBigNumber(value)) {
      // Assume keys containing 'time', 'Time', or 'Id' are not to be divided by 10^18
      if (key.includes('time') || key.includes('Time') || key.includes('Id')) {
        acc[key] = value.toString();
      } else {
        acc[key] = ethers.utils.formatUnits(value, 18);
      }
    } else if (Array.isArray(value)) {
      acc[key] = value.map((item) => {
        if (ethers.BigNumber.isBigNumber(item)) {
          // Apply the same logic for array items
          if (key.includes('time') || key.includes('Time') || key.includes('Id')) {
            return item.toString();
          } else {
            return ethers.utils.formatUnits(item, 18);
          }
        }
        return item;
      });
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});
}

async function main() {
  try {
    await hre.run('compile');
    await getMetadata();
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

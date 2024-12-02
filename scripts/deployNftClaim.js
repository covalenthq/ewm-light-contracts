const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();

async function deploy() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);
  console.log('Account balance:', (await deployer.getBalance()).toString());

  // Get addresses from environment variables
  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;
  const EWM_CLAIM_ADMIN_ADDRESS = process.env.EWM_CLAIM_ADMIN_ADDRESS;
  //   const NFT_CLAIM_ADDRESS = process.env.BASE_SEPOLIA_NFT_CLAIM;

  // Ensure the required environment variables are set
  if (!NFT_CONTROLLER_ADDRESS || !EWM_CLAIM_ADMIN_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('NFT Controller Address:', NFT_CONTROLLER_ADDRESS);
  console.log('Claim Admin Address:', EWM_CLAIM_ADMIN_ADDRESS);

  // Deploy EwmNftClaim
  const EwmNftClaim = await hre.ethers.getContractFactory('EwmNftClaim');
  console.log('Deploying EwmNftClaim...');
  const nftClaim = await EwmNftClaim.deploy(NFT_CONTROLLER_ADDRESS, EWM_CLAIM_ADMIN_ADDRESS);

  console.log('Waiting for EwmNftClaim deployment...');
  await nftClaim.deployed();

  console.log('EwmNftClaim deployed to:', nftClaim.address);

  // Wait for a few block confirmations to ensure the transaction is mined
  console.log('Waiting for block confirmations...');
  await nftClaim.deployTransaction.wait(5); // wait for 5 block confirmations

  // Verify the contract on Etherscan
  console.log('Verifying contract on Etherscan...');
  try {
    await hre.run('verify:verify', {
      address: nftClaim.address,
      constructorArguments: [NFT_CONTROLLER_ADDRESS, EWM_CLAIM_ADMIN_ADDRESS],
    });
    console.log('Contract verified successfully');
  } catch (error) {
    if (error.message.includes('Reason: Already Verified')) {
      console.log('Contract is already verified');
    } else {
      console.error('Error verifying contract:', error);
    }
  }
}

async function main() {
  try {
    await hre.run('compile');
    await deploy();
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

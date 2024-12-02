const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();

async function deploy() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);
  console.log('Account balance:', (await deployer.getBalance()).toString());

  // Get addresses from environment variables
  const CXT_ADDRESS = process.env.BASE_SEPOLIA_CXT_FAUCET;
  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;

  // Ensure the required environment variables are set
  if (!CXT_ADDRESS || !NFT_CONTROLLER_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('CXT Address:', CXT_ADDRESS);
  console.log('NFT Controller Address:', NFT_CONTROLLER_ADDRESS);

  // Set up contract parameters
  const stakePrice = ethers.utils.parseUnits('5000', 18); // 5000 CXT
  const startTime = Math.floor(Date.now() / 1000); // Current Unix timestamp
  const endTime = startTime + 5 * 24 * 60 * 60; // 5 days from now
  const maxTotalStakeable = ethers.utils.parseUnits('1000000', 18); // 200 Nfts
  const nftExpiryTime = startTime + 53 * 7 * 24 * 60 * 60; // 1 year and 1 week from now

  console.log('Stake Price:', ethers.utils.formatUnits(stakePrice, 18), 'CXT');
  console.log('Start Time:', new Date(startTime * 1000).toISOString());
  console.log('End Time:', new Date(endTime * 1000).toISOString());
  console.log('Max Total Stakeable:', ethers.utils.formatUnits(maxTotalStakeable, 18), 'CXT');
  console.log('NFT Expiry Time:', new Date(nftExpiryTime * 1000).toISOString());

  // Deploy EwmNftAllowance
  const EwmNftAllowance = await hre.ethers.getContractFactory('EwmNftAllowance');
  console.log('Deploying EwmNftAllowance...');
  const nftAllowance = await EwmNftAllowance.deploy(
    stakePrice,
    CXT_ADDRESS,
    NFT_CONTROLLER_ADDRESS,
    startTime,
    endTime,
    maxTotalStakeable,
    nftExpiryTime,
  );

  console.log('Waiting for EwmNftAllowance deployment...');
  await nftAllowance.deployed();

  console.log('EwmNftAllowance deployed to:', nftAllowance.address);

  // Wait for a few block confirmations to ensure the transaction is mined
  console.log('Waiting for block confirmations...');
  await nftAllowance.deployTransaction.wait(5); // wait for 5 block confirmations

  // Verify the contract on Etherscan
  console.log('Verifying contract on Etherscan...');
  try {
    await hre.run('verify:verify', {
      address: nftAllowance.address,
      constructorArguments: [
        stakePrice,
        CXT_ADDRESS,
        NFT_CONTROLLER_ADDRESS,
        startTime,
        endTime,
        maxTotalStakeable,
        nftExpiryTime,
      ],
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

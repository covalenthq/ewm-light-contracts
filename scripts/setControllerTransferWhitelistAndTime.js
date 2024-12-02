const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();

async function updateControllerSettings() {
  const [owner, claimAdmin] = await ethers.getSigners();

  console.log('Updating controller settings with the account:', owner.address);
  console.log('Account balance:', (await owner.getBalance()).toString());

  // Get addresses from environment variables
  const NFT_CONTROLLER_ADDRESS = process.env.BASE_SEPOLIA_NFT_CONTROLLER;
  const NFT_CLAIM_ADDRESS = process.env.BASE_SEPOLIA_NFT_CLAIM;

  // Ensure the required environment variables are set
  if (!NFT_CONTROLLER_ADDRESS || !NFT_CLAIM_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('NFT Controller Address:', NFT_CONTROLLER_ADDRESS);
  console.log('NFT Claim Address:', NFT_CLAIM_ADDRESS);

  // Get the NFT Controller contract instance
  const EwmNftController = await hre.ethers.getContractFactory('EwmNftController');
  const nftController = await EwmNftController.attach(NFT_CONTROLLER_ADDRESS);

  // 1. Update Minter Admin
  // console.log('Updating minter admin...');
  // const updateMinterAdminTx = await nftController
  //   .connect(owner)
  //   .updateMinterAdmin(NFT_CLAIM_ADDRESS);
  // await updateMinterAdminTx.wait();
  // console.log('Minter admin updated successfully');

  // 2. Update Transfer Whitelist
  console.log('Updating transfer whitelist...');
  const updateWhitelistTx = await nftController
    .connect(claimAdmin)
    .updateTransferWhiteList([NFT_CLAIM_ADDRESS], true);
  await updateWhitelistTx.wait();
  console.log('Transfer whitelist updated successfully');

  // 3. Update Whitelist Transfer Time
  const currentTime = Math.floor(Date.now() / 1000);
  const closeTime = currentTime + 5 * 24 * 60 * 60; // 5 days from now
  console.log('Updating whitelist transfer time...');
  const updateTransferTimeTx = await nftController
    .connect(claimAdmin)
    .updateWhitelistTransferTime(currentTime, closeTime);
  await updateTransferTimeTx.wait();
  console.log('Whitelist transfer time updated successfully');

  // Verify the updates
  const newMinterAdmin = await nftController.minterAdminAddress();
  // const isInWhitelist = await nftController._transferWhitelist(NFT_CLAIM_ADDRESS);
  const [startTime, endTime] = await nftController.getWhitelistTransferTime();

  console.log('New minter admin:', newMinterAdmin);
  // console.log('Claim contract in whitelist:', isInWhitelist);
  console.log('New whitelist transfer start time:', new Date(startTime * 1000).toISOString());
  console.log('New whitelist transfer end time:', new Date(endTime * 1000).toISOString());
}

async function main() {
  try {
    await hre.run('compile');
    await updateControllerSettings();
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

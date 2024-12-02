const hre = require('hardhat');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');
const { generateMerkleTree, generateMerkleProof, oneToken } = require('../test/helpers');
require('dotenv').config();

async function singleWhitelistedAllocation() {
  const NFT_ALLOWANCE_ADDRESS = process.env.BASE_SEPOLIA_NFT_ALLOWANCE;
  const CXT_ADDRESS = process.env.BASE_SEPOLIA_CXT_FAUCET;
  const SINGLE_HOLDER_PK = process.env.EWM_TOKEN_HOLDER_1;

  if (!NFT_ALLOWANCE_ADDRESS || !CXT_ADDRESS || !SINGLE_HOLDER_PK) {
    throw new Error('Required environment variables are not set');
  }

  // Create wallet instance from private key
  const tokenHolder = new ethers.Wallet(SINGLE_HOLDER_PK, ethers.provider);
  console.log('Token Holder Address:', tokenHolder.address);

  // Get the CXT contract instance
  const CXT = await hre.ethers.getContractFactory('CovalentXTokenFaucet');
  const cxtContract = await CXT.attach(CXT_ADDRESS);

  // Get CXT balance
  const cxtBalance = await cxtContract.balanceOf(tokenHolder.address);
  console.log('CXT Balance:', ethers.utils.formatUnits(cxtBalance, 18));

  // Calculate maximum possible NFTs based on CXT balance (5000 CXT per NFT)
  const stakePrice = oneToken.mul(5000);
  const maxNfts = cxtBalance.div(stakePrice);
  console.log('Maximum possible NFTs:', maxNfts.toString());

  if (maxNfts.isZero()) {
    console.log('Insufficient CXT balance for any NFT allocation');
    return;
  }

  // Read whitelist addresses from JSON file
  const whitelistFile = path.join(__dirname, 'data', 'tokenHolderWhitelistBaseSepolia.json');
  let whitelistAddresses;
  try {
    const fileContent = fs.readFileSync(whitelistFile, 'utf8');
    const fileData = JSON.parse(fileContent);
    whitelistAddresses = fileData.addresses;
  } catch (error) {
    console.error('Error reading whitelist file:', error);
    process.exit(1);
  }

  // Generate Merkle Tree and proof
  const proof = generateMerkleProof(whitelistAddresses, tokenHolder.address);

  // Get the NFT Allowance contract instance
  const EwmNftAllowance = await hre.ethers.getContractFactory('EwmNftAllowance');
  const nftAllowance = await EwmNftAllowance.attach(NFT_ALLOWANCE_ADDRESS);

  // Approve CXT spending
  const approvalAmount = stakePrice.mul(maxNfts);
  console.log(`Approving ${ethers.utils.formatUnits(approvalAmount, 18)} CXT for spending`);

  try {
    const approveTx = await cxtContract
      .connect(tokenHolder)
      .approve(NFT_ALLOWANCE_ADDRESS, approvalAmount);
    await approveTx.wait();
    console.log('CXT spending approved');

    // Perform allocation
    const allocTx = await nftAllowance.connect(tokenHolder).whitelistedAllocation(maxNfts, proof);
    await allocTx.wait();
    console.log(`Successfully allocated ${maxNfts} NFTs`);

    // Check final allocation
    const allowance = await nftAllowance.totalNftToMint(tokenHolder.address);
    console.log(`Final NFT mint allowance: ${allowance}`);
  } catch (error) {
    console.error('Error during allocation:', error.message);
  }
}

async function main() {
  try {
    await hre.run('compile');
    await singleWhitelistedAllocation();
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

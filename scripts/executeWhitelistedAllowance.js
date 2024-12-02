const hre = require('hardhat');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { generateMerkleTree, generateMerkleProof } = require('../test/helpers');
const { oneToken } = require('../test/helpers');

async function whitelistedAllocation() {
  const NFT_ALLOWANCE_ADDRESS = process.env.BASE_SEPOLIA_NFT_ALLOWANCE;
  const EWM_TOKEN_HOLDER_1_PK = process.env.EWM_TOKEN_HOLDER_1;
  const EWM_TOKEN_HOLDER_2_PK = process.env.EWM_TOKEN_HOLDER_2;
  const EWM_TOKEN_HOLDER_3_PK = process.env.EWM_TOKEN_HOLDER_3;
  const CXT_ADDRESS = process.env.BASE_SEPOLIA_CXT_FAUCET;

  if (!CXT_ADDRESS) {
    throw new Error('CXT_ADDRESS environment variable is not set');
  }

  if (
    !NFT_ALLOWANCE_ADDRESS ||
    !EWM_TOKEN_HOLDER_1_PK ||
    !EWM_TOKEN_HOLDER_2_PK ||
    !EWM_TOKEN_HOLDER_3_PK
  ) {
    throw new Error('Required environment variables are not set');
  }

  console.log('CXT Address:', CXT_ADDRESS);
  console.log('NFT Allowance Address:', NFT_ALLOWANCE_ADDRESS);

  // Create wallet instances from private keys
  const tokenHolder1 = new ethers.Wallet(EWM_TOKEN_HOLDER_1_PK, ethers.provider);
  const tokenHolder2 = new ethers.Wallet(EWM_TOKEN_HOLDER_2_PK, ethers.provider);
  const tokenHolder3 = new ethers.Wallet(EWM_TOKEN_HOLDER_3_PK, ethers.provider);

  console.log('Token Holder 1 Address:', tokenHolder1.address);
  console.log('Token Holder 2 Address:', tokenHolder2.address);
  console.log('Token Holder 3 Address:', tokenHolder3.address);

  // Get the CXT contract instance
  const CXT = await hre.ethers.getContractFactory('CovalentXTokenFaucet');
  const cxtContract = await CXT.attach(CXT_ADDRESS);

  // Set up the stake price
  const stakePrice = oneToken.mul(5000); // 5000 CXT

  // Approve CXT spending for each token holder
  async function approveCxtSpending(wallet, nftCount) {
    const approvalAmount = stakePrice.mul(nftCount);
    console.log(`Approving CXT spending for ${wallet.address} for ${nftCount} NFTs`);
    try {
      const tx = await cxtContract.connect(wallet).approve(NFT_ALLOWANCE_ADDRESS, approvalAmount);
      await tx.wait();
      console.log(`Successfully approved CXT spending for ${wallet.address}`);
    } catch (error) {
      console.error(`Failed to approve CXT spending for ${wallet.address}:`, error.message);
    }
  }

  console.log(
    'Performing whitelisted allocation with the accounts:, for amounts:',
    tokenHolder1.address,
    5,
    tokenHolder2.address,
    8,
    tokenHolder3.address,
    15,
    tokenHolder3.address,
    10,
  );
  // Read whitelist addresses from JSON file
  const whitelistFile = path.join(__dirname, 'data', 'tokenHolderWhitelistSepolia.json');
  let whitelistAddresses;
  try {
    const fileContent = fs.readFileSync(whitelistFile, 'utf8');
    const fileData = JSON.parse(fileContent);
    whitelistAddresses = fileData.addresses;
  } catch (error) {
    console.error('Error reading whitelist file:', error);
    process.exit(1);
  }

  // Generate Merkle Tree
  const merkleTree = generateMerkleTree(whitelistAddresses);
  const rootHash = merkleTree.getRoot();

  console.log('Merkle Root:', rootHash.toString('hex'));

  // Get the NFT Allowance contract instance
  const EwmNftAllowance = await hre.ethers.getContractFactory('EwmNftAllowance');
  const nftAllowance = await EwmNftAllowance.attach(NFT_ALLOWANCE_ADDRESS);

  console.log('NFT Allowance Address:', nftAllowance.address);

  async function performAllocation(wallet, amount) {
    const proof = generateMerkleProof(whitelistAddresses, wallet.address);
    console.log(`Performing allocation for address: ${wallet.address}`);
    try {
      const tx = await nftAllowance.connect(wallet).whitelistedAllocation(amount, proof);
      await tx.wait();
      console.log(`Successfully allocated ${amount} NFTs for ${wallet.address}`);
    } catch (error) {
      console.error(`Failed to allocate ${amount} NFTs for ${wallet.address}:`, error.message);
    }
  }

  // Allocate for EWM_TOKEN_HOLDER_1
  await approveCxtSpending(tokenHolder1, 5);
  await performAllocation(tokenHolder1, 5);

  // Allocate for EWM_TOKEN_HOLDER_2
  await approveCxtSpending(tokenHolder2, 8);
  await performAllocation(tokenHolder2, 8);

  // Try to allocate 15 for EWM_TOKEN_HOLDER_3 (should fail)
  await approveCxtSpending(tokenHolder3, 15);
  await performAllocation(tokenHolder3, 15);

  // Try again with 10 for EWM_TOKEN_HOLDER_3
  await approveCxtSpending(tokenHolder3, 10);
  await performAllocation(tokenHolder3, 10);

  // Check NFT mint allowance for each token holder
  async function checkAllowance(wallet) {
    const allowance = await nftAllowance.totalNftToMint(wallet.address);
    console.log(`NFT mint allowance for ${wallet.address}: ${allowance}`);
  }

  await checkAllowance(tokenHolder1);
  await checkAllowance(tokenHolder2);
  await checkAllowance(tokenHolder3);
}

async function main() {
  try {
    await hre.run('compile');
    await whitelistedAllocation();
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

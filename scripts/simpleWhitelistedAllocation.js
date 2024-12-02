const { ethers } = require('ethers');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const fs = require('fs');
const path = require('path');

// USER: FILL IN THESE VALUES
const USER_PRIVATE_KEY = ''; // Your private key (without 0x prefix)

// Contract Configuration
const CONFIG = {
  RPC_URL: 'https://sepolia.base.org',
  CXT_ADDRESS: '0xA081252408011D1d0C0eb535476f51C6803E2446',
  NFT_ALLOWANCE_ADDRESS: '0x099490b66b82ac58597da98D5a613f35bf3AB78C',
};

// Contract ABIs (minimal required functions)
const CXT_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
];

const NFT_ALLOWANCE_ABI = [
  'function whitelistedAllocation(uint256, bytes32[]) returns (bool)',
  'function totalNftToMint(address) view returns (uint256)',
];

// Merkle Tree functions
function generateMerkleTree(addresses) {
  const leafNodes = addresses.map((addr) => keccak256(addr));
  return new MerkleTree(leafNodes, keccak256, { sortPairs: true });
}

function generateMerkleProof(addresses, address) {
  const merkleTree = generateMerkleTree(addresses);
  console.log('Merkle Tree root:', merkleTree.getRoot().toString('hex'));
  const leaf = keccak256(address);
  return merkleTree.getHexProof(leaf);
}

async function main() {
  if (!USER_PRIVATE_KEY) {
    throw new Error('Please fill in your private key');
  }

  // Read whitelist addresses from JSON file
  const whitelistFile = path.join(__dirname, 'data', 'tokenHolderWhitelistBaseSepolia.json');
  let whitelistAddresses;
  try {
    const fileContent = fs.readFileSync(whitelistFile, 'utf8');
    const fileData = JSON.parse(fileContent);
    whitelistAddresses = fileData.addresses;
    console.log('Loaded whitelist addresses:', whitelistAddresses);
  } catch (error) {
    console.error('Error reading whitelist file:', error);
    process.exit(1);
  }

  // Setup provider and wallet
  const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
  const wallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);
  console.log('Your address:', wallet.address);

  // Setup contracts
  const cxtContract = new ethers.Contract(CONFIG.CXT_ADDRESS, CXT_ABI, provider);
  const nftAllowance = new ethers.Contract(
    CONFIG.NFT_ALLOWANCE_ADDRESS,
    NFT_ALLOWANCE_ABI,
    provider,
  );

  // Get CXT balance
  const cxtBalance = await cxtContract.balanceOf(wallet.address);
  console.log('Your CXT Balance:', ethers.utils.formatUnits(cxtBalance, 18));

  // Calculate maximum possible NFTs (5000 CXT per NFT)
  const oneToken = ethers.utils.parseUnits('1', 18);
  const stakePrice = oneToken.mul(5000);
  const maxNfts = cxtBalance.div(stakePrice);
  console.log('Maximum possible NFTs:', maxNfts.toString());

  if (maxNfts.isZero()) {
    console.log('Insufficient CXT balance for any NFT allocation');
    return;
  }

  // Generate Merkle proof
  const proof = generateMerkleProof(whitelistAddresses, wallet.address);
  console.log('Merkle Proof:', proof);

  try {
    //Approve CXT spending
    const approvalAmount = stakePrice.mul(maxNfts);
    console.log(`Approving ${ethers.utils.formatUnits(approvalAmount, 18)} CXT for spending`);
    const approveTx = await cxtContract
      .connect(wallet)
      .approve(CONFIG.NFT_ALLOWANCE_ADDRESS, approvalAmount);
    await approveTx.wait();
    console.log('CXT spending approved');

    // Perform allocation
    const allocTx = await nftAllowance.connect(wallet).whitelistedAllocation(maxNfts, proof);
    await allocTx.wait();
    console.log(`Successfully allocated ${maxNfts} NFTs`);

    // Check final allocation
    const allowance = await nftAllowance.totalNftToMint(wallet.address);
    console.log(`Final NFT mint allowance: ${allowance}`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);

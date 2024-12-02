const hre = require('hardhat');
const { ethers } = require('hardhat');
require('dotenv').config();

async function unpauseClaimContract() {
  const [owner] = await ethers.getSigners();

  console.log('Unpausing claim contract with the account:', owner.address);
  console.log('Account balance:', (await owner.getBalance()).toString());

  // Get addresses from environment variables
  const NFT_CLAIM_ADDRESS = process.env.BASE_SEPOLIA_NFT_CLAIM;

  // Ensure the required environment variables are set
  if (!NFT_CLAIM_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('NFT Claim Address:', NFT_CLAIM_ADDRESS);

  // Get the NFT Claim contract instance
  const EwmNftClaim = await hre.ethers.getContractFactory('EwmNftClaim');
  const nftClaim = await EwmNftClaim.attach(NFT_CLAIM_ADDRESS);

  console.log('Checking current pause status...');
  const isPaused = await nftClaim.paused();
  console.log('Contract is currently paused:', isPaused);

  if (!isPaused) {
    console.log('Contract is already unpaused. No action needed.');
    return;
  }

  console.log('Unpausing the claim contract...');

  // Unpause the contract
  const tx = await nftClaim.connect(owner).unpause();
  await tx.wait();

  console.log('Claim contract unpaused successfully');

  // Verify the update
  const newPauseStatus = await nftClaim.paused();
  console.log('New pause status:', newPauseStatus);

  if (!newPauseStatus) {
    console.log('Claim contract successfully unpaused');
  } else {
    console.log('Warning: Claim contract is still paused');
  }
}

async function main() {
  try {
    await hre.run('compile');
    await unpauseClaimContract();
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

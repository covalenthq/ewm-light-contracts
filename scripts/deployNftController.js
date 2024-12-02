const hre = require('hardhat');
require('dotenv').config();

async function deploy() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);
  console.log('Account balance:', (await deployer.getBalance()).toString());

  // Get addresses from environment variables
  const CXT_ADDRESS = process.env.BASE_SEPOLIA_CXT_FAUCET;
  const ADMIN_ADDRESS = process.env.EWM_CLAIM_ADMIN_ADDRESS;
  const REWARD_ADDRESS = process.env.EWM_REWARD_MANAGER_ADDRESS;

  // Ensure the required environment variables are set
  if (!CXT_ADDRESS || !ADMIN_ADDRESS) {
    throw new Error('Required environment variables are not set');
  }

  console.log('CXT Address:', CXT_ADDRESS);
  console.log('Admin Address:', ADMIN_ADDRESS);
  console.log('Reward Manager Address:', REWARD_ADDRESS);

  // Deploy EwmNftController
  const EwmNftController = await hre.ethers.getContractFactory('EwmNftController');
  const nftController = await hre.upgrades.deployProxy(
    EwmNftController,
    [
      CXT_ADDRESS,
      ADMIN_ADDRESS, // minterAdmin
      ADMIN_ADDRESS, // banAdmin
      ADMIN_ADDRESS, // whitelistAdmin
      REWARD_ADDRESS, // rewardManager
    ],
    { initializer: 'initialize' },
  );

  await nftController.deployed();

  console.log('EwmNftController deployed to:', nftController.address);

  // Verify the contract on Etherscan
  if (hre.network.name !== 'hardhat' && hre.network.name !== 'localhost') {
    console.log('Waiting for block confirmations...');
    await nftController.deployTransaction.wait(5);
    console.log('Verifying contract on Etherscan...');
    try {
      await hre.run('verify:verify', {
        address: nftController.address,
        constructorArguments: [],
      });
      console.log('Contract implementation verified successfully');

      // Verify the proxy initialization
      const implementationAddress = await upgrades.erc1967.getImplementationAddress(
        nftController.address,
      );
      await hre.run('verify:verify', {
        address: implementationAddress,
        constructorArguments: [],
      });

      console.log('Verifying proxy initialization...');
      await hre.run('verify:verify', {
        address: nftController.address,
        constructorArguments: [],
        contract: 'contracts/EwmNftController.sol:EwmNftController',
      });

      console.log('Contract fully verified successfully');
    } catch (error) {
      if (error.message.includes('Reason: Already Verified')) {
        console.log('Contract is already verified');
      } else {
        console.error('Error verifying contract:', error);
      }
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

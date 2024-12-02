const hre = require('hardhat');
const NAME = 'CovalentXTokenFaucet';
const SYMBOL = 'CXT';
const MAX_SUPPLY = BigInt(1000000000000000000000000000);

async function deploy() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);
  console.log('Account balance:', (await deployer.getBalance()).toString());

  const CxtFaucet = await hre.ethers.getContractFactory('CovalentXTokenFaucet', deployer);
  const cxtFaucet = await CxtFaucet.deploy(NAME, SYMBOL, MAX_SUPPLY);

  console.log('Waiting for CxtFaucet deployment...');
  await cxtFaucet.deployed();

  console.log('CovalentXTokenFaucet deployed to:', cxtFaucet.address);

  // Wait for a few block confirmations to ensure the transaction is mined
  console.log('Waiting for block confirmations...');
  await cxtFaucet.deployTransaction.wait(5); // wait for 5 block confirmations

  // Verify the contract on Etherscan
  console.log('Verifying contract on Etherscan...');
  try {
    await hre.run('verify:verify', {
      address: cxtFaucet.address,
      constructorArguments: [NAME, SYMBOL, MAX_SUPPLY],
    });
    console.log('Contract verified successfully');
  } catch (error) {
    console.error('Error verifying contract:', error);
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

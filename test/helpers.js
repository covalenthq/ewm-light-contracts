const { deployMockContract } = require('@ethereum-waffle/mock-contract');
const { ethers } = require('hardhat');
const { MerkleTree } = require('merkletreejs');
const hre = require('hardhat');
const CQT_ABI = require('../abis/erc20.json');
const keccak256 = require('keccak256');
const oneToken = ethers.BigNumber.from('1000000000000000000');

const OWNER = '0x8D1f2eBFACCf1136dB76FDD1b86f1deDE2D23852';
const WHALE = '0x189B9cBd4AfF470aF2C0102f365FC1823d857965';
const ADMIN = '0x189B9cBd4AfF470aF2C0102f365FC1823d857965';

const DELEGATOR_ADDRESSES = [
  '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe',
  '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
  '0x61EDCDf5bb737ADffE5043706e7C5bb1f1a56eEA',
  '0xC61b9BB3A7a0767E3179713f3A5c7a9aeDCE193C',
  '0x0548f59fee79f8832c299e01dca5c76f034f558e',
  '0x189b9cbd4aff470af2c0102f365fc1823d857965',
  '0x9845e1909dca337944a0272f1f9f7249833d2d19',
  '0xb29380ffc20696729b7ab8d093fa1e2ec14dfe2b',
  '0xcdbf58a9a9b54a2c43800c50c7192946de858321',
  '0x19184ab45c40c2920b0e0e31413b9434abd243ed',
  '0xb270FC573F9f9868ab11B52AE7119120f6a4471d',
  '0xa56B1B002814Ac493A6DAb5A72d30996B6A9Fe4d',
  '0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b',
];

const TOKEN_HOLDERS_ADDRESSES = [
  '0x076924c052b7a3112bee8658a8c3e19d69361df2',
  '0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c',
  '0xfb33ed64cea706a622f2dad79a687d8256413c27',
  '0x285b10c73de847ee35bcb5cd86f17d55ff936476',
  '0xff26ccf9058b9bd8facfb6a8876864fec193285d',
  '0xa2dcb52f5cf34a84a2ebfb7d937f7051ae4c697b',
  '0x9437806725631c0b209b6c0b5fd4198a77a57073',
  '0x0000006daea1723962647b7e189d311d757fb793',
  '0x267c9504cb5e570e4fb923be5fcdaa9460789441',
  '0xd6236f3de6850683b63a6ec02184284d91f245de',
  '0xfb9fad3de077894628cb8f78ae68e2d436b98190',
  '0x3bb9378a2a29279aa82c00131a6046aa0b5f6a79',
  '0xa1d8d972560c2f8144af871db508f0b0b10a3fbf',
  '0x8D1f2eBFACCf1136dB76FDD1b86f1deDE2D23852', // Add OWNER to this for whitelisting from transfer
];

const REWARDS_MANAGER = '0xaaaaa351756104a0fecB3842B7334f42E1e4d042';

const impersonate = async (address) =>
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });

const impersonateAll = async () => {
  const ALL = [
    OWNER,
    WHALE,
    ADMIN,
    REWARDS_MANAGER,
    ...TOKEN_HOLDERS_ADDRESSES,
    ...DELEGATOR_ADDRESSES,
  ];
  for (let i = 0; i < ALL.length; i++) await impersonate(ALL[i]);
};

const giveEth = async (amount, holders) => {
  let giver = await ethers.getSigner(WHALE);
  const feeData = await ethers.provider.getFeeData();
  for (let i = 0; i < holders.length; i++) {
    await giver.sendTransaction({
      to: holders[i].address,
      value: ethers.utils.parseEther(amount),
      gasPrice: feeData.maxFeePerGas,
    });
  }
};

const getSigner = async (address) => {
  await impersonate(address);
  const signer = await ethers.getSigner(address);
  await giveEth('1.0', [signer]);
  return signer;
};

const getAdmin = async () => {
  await impersonate(ADMIN);
  return await ethers.getSigner(ADMIN);
};

const getRewardsManager = async () => {
  await impersonate(REWARDS_MANAGER);
  const signer = await ethers.getSigner(REWARDS_MANAGER);
  return signer;
};

const getSigners = async (addresses) => {
  let signers = [];
  for (let i = 0; i < addresses.length; i++) {
    signers.push(await ethers.getSigner(addresses[i]));
  }
  return signers;
};

const getTokenHolders = async () => {
  let holders = await getSigners(TOKEN_HOLDERS_ADDRESSES);
  await giveEth('10.0', holders);
  return holders;
};

const getDelegators = async () => {
  let delegators = await getSigners(DELEGATOR_ADDRESSES);
  await giveEth('10.0', delegators);
  return delegators;
};

const getOwner = async () => {
  await impersonate(OWNER);
  return await ethers.getSigner(OWNER);
};

async function deployMockCqtContract(signer) {
  let cqtContract = await deployMockContract(signer, CQT_ABI);
  cqtContract.mock.totalSupply.returns(oneToken.mul(1_000_000_000_000_000));
  cqtContract.mock.balanceOf.returns(oneToken.mul(1_000_000_000));
  cqtContract.mock.approve.returns(true);
  cqtContract.mock.transfer.returns(true);
  cqtContract.mock.allowance.returns(oneToken.mul(1_000_000_000));
  cqtContract.mock.transferFrom.returns(true);
  return cqtContract;
}

const deployUpgradeableContract = async (contractName, owner, params) => {
  await impersonateAll();
  const factory = await ethers.getContractFactory(contractName, owner);
  const contract = await upgrades.deployProxy(factory, params, { initializer: 'initialize' });
  return await contract.deployed();
};

const deployNFTController = async (params) =>
  await deployUpgradeableContract('EwmNftController', await getOwner(), params);

const deployNFTControllerWithDefaultParams = async (cxtContract) =>
  await deployNFTController([cxtContract.address, OWNER, OWNER, OWNER]);

const depositReward = async (cqtContract, contract, amount) => {
  await cqtContract.approve(contract.address, amount);
  await contract.depositRewardTokens(amount);
};

const getAccount = async (address) => await ethers.getSigner(address);

const giveCQT = async (contract, amount, to) => {
  const owner = await getOwner();
  console.log('Giving CQT to', to, amount, 'from', contract.address);
  await contract.connect(owner).approve(to, amount);
  await contract.connect(owner).transfer(to, amount);
  return;
};

// Helper function to deploy a mock allowance contract
async function deployMockAllowanceContract(owner) {
  const MockAllowance = await ethers.getContractFactory('MockEwmNftAllowance', owner);
  const mockAllowance = await MockAllowance.deploy();
  await mockAllowance.deployed();
  return mockAllowance;
}

// Helper functions for Merkle tree operations
function generateMerkleTree(addresses) {
  const leaves = addresses.map((addr) => keccak256(addr));
  return new MerkleTree(leaves, keccak256, { sortPairs: true });
}

function generateMerkleProof(addresses, address) {
  const merkleTree = generateMerkleTree(addresses);
  const leaf = keccak256(address);
  return merkleTree.getHexProof(leaf);
}

async function deployCxtFaucet() {
  const NAME = 'CovalentXTokenFaucet';
  const SYMBOL = 'CXT';
  const MAX_SUPPLY = BigInt(1000000000000000000000000000);
  const owner = await getOwner();

  const CXTFaucet = await ethers.getContractFactory('CovalentXTokenFaucet', owner);
  const cxtFaucet = await CXTFaucet.deploy(NAME, SYMBOL, MAX_SUPPLY);
  await cxtFaucet.deployed();

  return cxtFaucet;
}

exports.depositReward = depositReward;
exports.getOwner = getOwner;
exports.getRewardsManager = getRewardsManager;
exports.getTokenHolders = getTokenHolders;
exports.getDelegators = getDelegators;
exports.deployNFTControllerWithDefaultParams = deployNFTControllerWithDefaultParams;
exports.deployNFTController = deployNFTController;
exports.impersonateAll = impersonateAll;
exports.impersonate = impersonate;
exports.giveEth = giveEth;
exports.getAccount = getAccount;
exports.giveCQT = giveCQT;
exports.getSigner = getSigner;
exports.getSigners = getSigners;
exports.getAdmin = getAdmin;
exports.deployMockCqtContract = deployMockCqtContract;
exports.oneToken = oneToken;
exports.deployMockAllowanceContract = deployMockAllowanceContract;
exports.generateMerkleTree = generateMerkleTree;
exports.generateMerkleProof = generateMerkleProof;
exports.deployCxtFaucet = deployCxtFaucet;

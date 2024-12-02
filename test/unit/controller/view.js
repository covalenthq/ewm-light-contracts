const { expect } = require('chai');
const {
  impersonateAll,
  getAdmin,
  getTokenHolders,
  getDelegators,
  getOwner,
  getRewardsManager,
  deployMockCqtContract,
  depositReward,
  oneToken,
} = require('../../helpers');

function calculateInterfaceId(interfaceAbi) {
  return interfaceAbi
    .filter((item) => item.type === 'function')
    .map((item) =>
      ethers.utils.id(`${item.name}(${item.inputs.map((input) => input.type).join(',')})`),
    )
    .reduce((prev, curr) => ethers.BigNumber.from(prev).xor(ethers.BigNumber.from(curr)))
    .toHexString()
    .slice(0, 10);
}

describe('EwmNftController - Public View Functions', () => {
  let controllerContract;
  let owner;
  let admin;
  let rewarder;
  let tokenHolderAddresses;
  let delegatorAddresses;
  let cqtContract;
  let expiryTime;
  // let newExpires;
  before(async () => {
    await impersonateAll();
    owner = await getOwner();
    admin = await getAdmin();
    rewarder = await getRewardsManager();
    const tokenHolders = await getTokenHolders();
    const delegators = await getDelegators();
    const blockTime = await ethers.provider.getBlock('latest');
    const currentTimestamp = blockTime.timestamp;
    expiryTime = currentTimestamp + 3600; // 1 hour from now
    tokenHolderAddresses = tokenHolders.slice(0, 5).map((holder) => holder.address);
    delegatorAddresses = delegators.slice(0, 5).map((delegator) => delegator.address);

    cqtContract = await deployMockCqtContract(owner);
    const controller = await ethers.getContractFactory('EwmNftController', owner);
    controllerContract = await upgrades.deployProxy(
      controller,
      [cqtContract.address, owner.address, owner.address, owner.address, rewarder.address],
      { initializer: 'initialize' },
    );
    await controllerContract.deployed();

    // Setup
    await controllerContract.setBaseUrl('https://storage.googleapis.com/covalent-project/emw-lc/');
    await controllerContract.updateMinterAdmin(admin.address);
    await controllerContract.updateBanAdmin(admin.address);
    await controllerContract.updateWhitelistAdmin(admin.address);
    await controllerContract.updateRewardAdmin(rewarder.address);
    await controllerContract.connect(owner).setExpiryRange(1, 100, expiryTime);
  });

  describe('userOf', () => {
    it('should return the correct user of a token', async () => {
      await controllerContract.mint(tokenHolderAddresses[0], 1);
      const tokenId = 1;
      await controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[0]))
        .setUser(tokenId, delegatorAddresses[0]);

      expect(await controllerContract.userOf(tokenId)).to.equal(delegatorAddresses[0]);
    });

    it('should return zero address for expired user', async () => {
      await controllerContract.mint(tokenHolderAddresses[1], 1);
      const tokenId = 2;
      await controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[1]))
        .setUser(tokenId, delegatorAddresses[1]);

      await ethers.provider.send('evm_increaseTime', [3601]);
      await ethers.provider.send('evm_mine');

      expect(await controllerContract.userOf(tokenId)).to.equal(ethers.constants.AddressZero);
      expect(await controllerContract.userExpires(tokenId)).to.equal(expiryTime);
    });
  });

  describe('userExpires', () => {
    it('should return the correct expiration time for a user', async () => {
      const tokenId = 1;
      const expires = await controllerContract.userExpires(tokenId);
      expect(expires).to.be.gt(0);
    });
  });

  describe('userReedemable', () => {
    it('should return the correct redeemable amount for a user', async () => {
      const tokenId = 1;
      const redeemable = await controllerContract.userReedemable(tokenId);
      expect(redeemable).to.equal(0);
    });
  });

  describe('supportsInterface', () => {
    it('should support IERC4907 interface', async () => {
      const IERC4907 = require('../../../artifacts/contracts/interfaces/IERC4907.sol/IERC4907.json');
      const IERC4907InterfaceId = calculateInterfaceId(IERC4907.abi);
      expect(await controllerContract.supportsInterface(IERC4907InterfaceId)).to.be.true;
    });
  });

  describe('getBanEndTime', () => {
    it('should return the correct ban end time for a token', async () => {
      const tokenId = 1;
      const banEndTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      await controllerContract.connect(admin).ban(tokenId, banEndTime);
      expect(await controllerContract.getBanEndTime(tokenId)).to.equal(banEndTime);
    });
  });

  describe('isBanned', () => {
    it('should return true for a banned token', async () => {
      const tokenId = 1;
      expect(await controllerContract.isBanned(tokenId)).to.be.true;
    });

    it('should return false for an unbanned token', async () => {
      const tokenId = 2;
      expect(await controllerContract.isBanned(tokenId)).to.be.false;
    });
  });

  describe('tokenIdsOfOwnerByAmount', () => {
    it('should return the correct token IDs for an owner', async () => {
      await controllerContract.mint(tokenHolderAddresses[2], 3);
      const tokenIds = await controllerContract.tokenIdsOfOwnerByAmount(tokenHolderAddresses[2], 3);
      expect(tokenIds.length).to.equal(3);
      expect(tokenIds[0]).to.be.gt(0);
    });
  });

  describe('inTransferWhitelist', () => {
    it('should return true for an address in the transfer whitelist', async () => {
      await controllerContract
        .connect(admin)
        .updateTransferWhiteList([tokenHolderAddresses[0]], true);
      expect(await controllerContract.inTransferWhitelist(tokenHolderAddresses[0])).to.be.true;
    });

    it('should return false for an address not in the transfer whitelist', async () => {
      expect(await controllerContract.inTransferWhitelist(tokenHolderAddresses[1])).to.be.false;
    });
  });

  describe('getWhitelistTransferTime', () => {
    it('should return the correct whitelist transfer time range', async () => {
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime + 3600;
      await controllerContract.connect(admin).updateWhitelistTransferTime(startTime, endTime);
      const [returnedStartTime, returnedEndTime] =
        await controllerContract.getWhitelistTransferTime();
      expect(returnedStartTime).to.equal(startTime);
      expect(returnedEndTime).to.equal(endTime);
    });
  });

  describe('paused', () => {
    it('should return false when the contract is not paused', async () => {
      expect(await controllerContract.paused()).to.be.false;
    });

    it('should return true when the contract is paused', async () => {
      await controllerContract.pause();
      expect(await controllerContract.paused()).to.be.true;
      await controllerContract.unpause();
    });
  });

  describe('getMetadata', () => {
    it('should return the correct metadata', async () => {
      const rewardAmount = oneToken.mul(100);
      await depositReward(cqtContract, controllerContract, rewardAmount);
      const metadata = await controllerContract.getMetadata();
      expect(metadata._nftController).to.equal(controllerContract.address);
      expect(metadata._cxt).to.equal(cqtContract.address);
      expect(metadata._minterAdmin).to.equal(admin.address);
      expect(metadata._banAdmin).to.equal(admin.address);
      expect(metadata._whitelistAdmin).to.equal(admin.address);
      expect(metadata._rewardManager).to.equal(rewarder.address);
      expect(metadata._nextTokenId).to.be.gt(0);
      expect(metadata._rewardPool).to.equal(rewardAmount);
      expect(metadata._nftTransferable).to.be.false;
      expect(metadata._baseUrl).to.equal('https://storage.googleapis.com/covalent-project/emw-lc/');
    });
  });

  describe('getUserInfo', () => {
    it('should return the correct user info for a token', async () => {
      const tokenId = 2;
      const currentBlockTimestamp = await ethers.provider
        .getBlock('latest')
        .then((b) => b.timestamp);
      const expires = currentBlockTimestamp + 3600; // Set expiration to 1 hour from now
      await controllerContract.connect(owner).updateExpiryRange(0, 1, 100, expires);
      await expect(
        controllerContract
          .connect(await ethers.getSigner(tokenHolderAddresses[1]))
          .setUser(tokenId, delegatorAddresses[1]),
      )
        .to.emit(controllerContract, 'UpdateUser')
        .withArgs(tokenId, delegatorAddresses[1], expires);
      const userInfo = await controllerContract.getUserInfo(tokenId);
      expect(userInfo.user).to.equal(delegatorAddresses[1]);
      expect(userInfo.expires).to.be.gt(0);
      expect(userInfo.redeemable).to.equal(0);
    });
  });

  describe('getBanRecord', () => {
    it('should return the correct ban record for a token', async () => {
      const tokenId = 1;
      const banRecord = await controllerContract.getBanRecord(tokenId);
      expect(banRecord).to.be.gt(0);
    });
  });

  describe('isInTransferWhitelist', () => {
    it('should return true for an address in the transfer whitelist', async () => {
      expect(await controllerContract.inTransferWhitelist(tokenHolderAddresses[0])).to.be.true;
    });

    it('should return false for an address not in the transfer whitelist', async () => {
      expect(await controllerContract.inTransferWhitelist(tokenHolderAddresses[1])).to.be.false;
    });
  });

  describe('balanceOf', () => {
    it('should return the correct balance of tokens for an address', async () => {
      await controllerContract.connect(admin).mint(tokenHolderAddresses[0], 3);
      const balance = await controllerContract.balanceOf(tokenHolderAddresses[0]);
      expect(balance).to.equal(4);
    });
  });

  describe('getApproved', () => {
    it('should return the approved address for a token', async () => {
      const tokenId = 1;
      const approvedAddress = await controllerContract.getApproved(tokenId);
      expect(approvedAddress).to.equal(ethers.constants.AddressZero);
    });
  });

  describe('isApprovedForAll', () => {
    it('should return true if an operator is approved for all tokens of an owner', async () => {
      await controllerContract
        .connect(await ethers.getSigner(tokenHolderAddresses[0]))
        .setApprovalForAll(tokenHolderAddresses[1], true);
      await controllerContract
        .connect(admin)
        .updateTransferWhiteList([tokenHolderAddresses[1]], true);
      const isApproved = await controllerContract.isApprovedForAll(
        tokenHolderAddresses[0],
        tokenHolderAddresses[1],
      );
      expect(isApproved).to.be.true;
    });
  });

  describe('owner', () => {
    it('should return the correct owner of the contract', async () => {
      const contractOwner = await controllerContract.owner();
      expect(contractOwner).to.equal(owner.address);
    });
  });

  describe('ownerOf', () => {
    it('should return the correct owner of a token', async () => {
      const tokenId = await controllerContract.nextTokenId();
      await controllerContract.connect(admin).mint(tokenHolderAddresses[0], 1);
      const tokenOwner = await controllerContract.ownerOf(tokenId);
      expect(tokenOwner).to.equal(tokenHolderAddresses[0]);
    });
  });

  describe('pendingOwner', () => {
    it('should return the correct pending owner of the contract', async () => {
      await controllerContract.connect(owner).transferOwnership(tokenHolderAddresses[1]);
      const pendingOwner = await controllerContract.pendingOwner();
      expect(pendingOwner).to.equal(tokenHolderAddresses[1]);
    });
  });

  describe('tokenByIndex', () => {
    it('should return the correct token ID for a given index', async () => {
      await controllerContract.connect(admin).mint(tokenHolderAddresses[0], 3);
      const tokenId = await controllerContract.tokenByIndex(1);
      expect(tokenId).to.equal(2);
    });
  });

  describe('tokenOfOwnerByIndex', () => {
    it('should return the correct token ID for a given owner and index', async () => {
      await controllerContract.connect(admin).mint(tokenHolderAddresses[0], 3);
      const tokenId = await controllerContract.tokenOfOwnerByIndex(tokenHolderAddresses[0], 1);
      expect(tokenId).to.be.gt(0);
    });
  });
});

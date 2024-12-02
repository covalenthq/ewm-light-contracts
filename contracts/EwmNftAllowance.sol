// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {Pausable} from '@openzeppelin/contracts/security/Pausable.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts/utils/cryptography/MerkleProof.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import '@openzeppelin/contracts/utils/Address.sol';

contract EwmNftAllowance is Ownable2Step, Pausable, ReentrancyGuard {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  IERC20Upgradeable public cxt;
  IERC721 public nftController;
  uint256 public stakePrice;
  uint256 public startTime;
  uint256 public endTime;
  uint256 public maxTotalStakeable;
  uint256 public totalStakeReceived;
  uint256 public nftExpiryTime;

  // tracks total NFTs purchased by each address
  mapping(address => uint256) public totalNftToMint;
  // tracks staked amount for each address
  mapping(address => uint256) public userStakeAmount;

  bytes32 public whitelistRootHash;
  bool public isIntegerAllowance = false;

  event Allocation(address staker, uint256 nftQuantity);
  event StakeReleased(address to, uint256 amount);
  event NftExpiryTimeUpdated(uint256 newExpiryTime);
  event NftControllerUpdated(IERC721 newController);
  event WhitelistRootHashUpdated(bytes32 newRootHash);
  event IntegerAllocationUpdated(bool newIsIntegerAllowance);
  event AllocationPeriodUpdated(uint256 startTime, uint256 endTime);
  event MaxTotalStakeableUpdated(uint256 newMaxTotalStakeable);

  constructor(
    uint256 _stakePrice,
    IERC20Upgradeable _cxt,
    IERC721 _nftController,
    uint256 _startTime,
    uint256 _endTime,
    uint256 _maxTotalStakeable,
    uint256 _nftExpiryTime
  ) {
    require(_stakePrice > 0, 'Stake price must be greater than 0');
    require(address(_cxt) != address(0), 'CXT token address cannot be zero');
    require(address(_nftController) != address(0), 'NFT controller address cannot be zero');
    require(_startTime > block.timestamp, 'Start time must be in the future');
    require(_endTime > _startTime, 'End time must be after start time');
    require(_maxTotalStakeable > 0, 'Max total stakeable must be greater than 0');
    require(_nftExpiryTime > _endTime, 'NFT expiry time must be after end time');

    stakePrice = _stakePrice;
    cxt = IERC20Upgradeable(_cxt);
    nftController = _nftController;
    startTime = _startTime;
    endTime = _endTime;
    maxTotalStakeable = _maxTotalStakeable;
    nftExpiryTime = _nftExpiryTime;
  }

  modifier onlyDuringAllocation() {
    require(
      block.timestamp >= startTime && block.timestamp <= endTime,
      'Not during allocation period'
    );
    _;
  }

  modifier onlyAfterAllocation() {
    require(block.timestamp > endTime, 'Allocation period has not ended');
    _;
  }

  function setWhitelistRootHash(bytes32 _rootHash) external whenNotPaused onlyOwner {
    whitelistRootHash = _rootHash;

    emit WhitelistRootHashUpdated(_rootHash);
  }

  function setIsIntegerAllocation(bool _isIntegerAllowance) public whenNotPaused onlyOwner {
    isIntegerAllowance = _isIntegerAllowance;

    emit IntegerAllocationUpdated(_isIntegerAllowance);
  }

  function whitelistedAllocation(
    uint256 nftQuantity,
    bytes32[] calldata merkleProof
  ) public virtual whenNotPaused onlyDuringAllocation nonReentrant {
    require(checkWhitelist(_msgSender(), merkleProof), 'proof invalid');
    if (Address.isContract(_msgSender())) {
      require(
        IERC721Receiver(_msgSender()).onERC721Received(address(this), address(0), 0, '') ==
          IERC721Receiver.onERC721Received.selector,
        'Caller cannot handle ERC721 tokens'
      );
    }
    _allocate(nftQuantity);
  }

  function _allocate(uint256 nftQuantity) internal {
    uint256 stakeAmount = nftQuantity * stakePrice;
    require(
      totalStakeReceived + stakeAmount <= maxTotalStakeable,
      'Exceeds max total allowable stake'
    );

    if (isIntegerAllowance) {
      require(nftQuantity <= 10, 'Can only stake 10 NFTs at max in integer allowance');
    }

    _transferToContract(_msgSender(), stakeAmount);
    totalStakeReceived += stakeAmount;
    totalNftToMint[_msgSender()] += nftQuantity;
    userStakeAmount[_msgSender()] += stakeAmount;

    emit Allocation(_msgSender(), nftQuantity);
  }

  function checkWhitelist(address user, bytes32[] calldata merkleProof) public view returns (bool) {
    bytes32 leaf = keccak256(abi.encodePacked(user));
    return MerkleProof.verify(merkleProof, whitelistRootHash, leaf);
  }

  function releaseNftStake(
    uint256 nftQuantityToRelease
  ) external whenNotPaused nonReentrant onlyAfterAllocation {
    require(block.timestamp > nftExpiryTime, 'NFT expiry time has not passed');
    require(nftQuantityToRelease > 0, 'Must release at least one NFT');

    uint256 userNftBalance = nftController.balanceOf(msg.sender);
    require(userNftBalance >= nftQuantityToRelease, 'Insufficient NFTs owned');

    uint256 stakeAmountToRelease = nftQuantityToRelease * stakePrice;
    require(userStakeAmount[msg.sender] >= stakeAmountToRelease, 'Insufficient stake amount');

    userStakeAmount[msg.sender] -= stakeAmountToRelease;
    totalStakeReceived -= stakeAmountToRelease;
    totalNftToMint[msg.sender] -= nftQuantityToRelease;

    _transferFromContract(msg.sender, stakeAmountToRelease);

    emit StakeReleased(msg.sender, stakeAmountToRelease);
  }

  function pause() public onlyOwner {
    _pause();
  }

  function unpause() public onlyOwner {
    _unpause();
  }

  function setNftControllerAddress(IERC721 _nftController) external onlyOwner {
    require(address(_nftController) != address(0), 'Zero address not allowed for NFT controller');
    nftController = _nftController;

    emit NftControllerUpdated(_nftController);
  }

  function setNftExpiryTime(uint256 _nftExpiryTime) external onlyOwner {
    require(_nftExpiryTime > endTime, 'NFT expiry time must be after end time');
    nftExpiryTime = _nftExpiryTime;

    emit NftExpiryTimeUpdated(_nftExpiryTime);
  }

  function updateAllocationPeriod(uint256 _startTime, uint256 _endTime) external onlyOwner {
    require(_endTime > _startTime, 'End time must be after start time');
    require(_endTime > block.timestamp, 'End time must be in the future');
    require(_startTime >= block.timestamp, 'Start time must not be in the past');
    require(_endTime < nftExpiryTime, 'End time must be before NFT expiry time');

    startTime = _startTime;
    endTime = _endTime;

    emit AllocationPeriodUpdated(_startTime, _endTime);
  }

  function updateMaxTotalStakeable(uint256 _maxTotalStakeable) external onlyOwner {
    require(
      _maxTotalStakeable > totalStakeReceived,
      'New max must be greater than current total stake'
    );

    maxTotalStakeable = _maxTotalStakeable;

    emit MaxTotalStakeableUpdated(_maxTotalStakeable);
  }

  function renounceOwnership() public virtual override onlyOwner {
    revert('Ownable2Step: can not renounce ownership');
  }

  function _transferToContract(address from, uint256 amount) internal {
    cxt.safeTransferFrom(from, address(this), amount);
  }

  function _transferFromContract(address to, uint256 amount) internal {
    cxt.safeTransfer(to, amount);
  }

  function getMetadata()
    external
    view
    returns (
      address _nftAllowance,
      IERC721 _nftController,
      IERC20Upgradeable _cxt,
      uint256 _stakePrice,
      uint256 _startTime,
      uint256 _endTime,
      uint256 _maxTotalStakeable,
      uint256 _totalStakeReceived,
      uint256 _nftExpiryTime,
      bytes32 _whitelistRootHash,
      bool _isIntegerAllowance
    )
  {
    return (
      address(this),
      nftController,
      cxt,
      stakePrice,
      startTime,
      endTime,
      maxTotalStakeable,
      totalStakeReceived,
      nftExpiryTime,
      whitelistRootHash,
      isIntegerAllowance
    );
  }
}

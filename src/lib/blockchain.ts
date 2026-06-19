import { ethers } from 'ethers'

const PREDICTION_REGISTRY_ABI = [
  'function storePrediction(bytes32 predictionHash, string userId, uint256 matchId, string matchName, string predictionSummary) external',
  'function storeAndSettle(address user, bytes32 predictionHash, string userId, uint256 matchId, string matchName, string predictionSummary, string matchResult) external',
  'function getUserPredictions(address user) external view returns ((bytes32 predictionHash, string userId, uint256 matchId, string matchName, string predictionSummary, uint256 timestamp, address submitter, bool isCorrect, bool isSettled, uint8 rewardTier, uint256 rewardAmount)[])',
  'function getPredictionCount() external view returns (uint256)',
  'function markPrediction(bytes32 predictionHash, bool correct, uint8 rewardTier) external',
  'function claimRewards() external',
  'function getUnclaimedReward(address user) external view returns (uint256)',
  'function hashToIndex(bytes32) external view returns (uint256)',
  'function REWARD_PER_CORRECT() external view returns (uint256)',
  'function PENALTY_PER_WRONG() external view returns (uint256)',
  'function GAS_GRANT() external view returns (uint256)',
  'function swapRate() external view returns (uint256)',
  'function swapPREDForPOL(uint256 predAmount) external',
  'function getContractBalance() external view returns (uint256)',
  'function withdrawPOL(address to, uint256 amount) external',
]

const PREDICTION_TOKEN_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
]

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS as string
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_PREDICTION_TOKEN_ADDRESS as string
const POLYGON_RPC = process.env.NEXT_PUBLIC_AMOY_RPC || 'https://rpc-amoy.polygon.technology'

function getReadContract() {
  const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC)
  return new ethers.Contract(CONTRACT_ADDRESS, PREDICTION_REGISTRY_ABI, rpcProvider)
}

function getTokenContract() {
  const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC)
  return new ethers.Contract(TOKEN_ADDRESS, PREDICTION_TOKEN_ABI, rpcProvider)
}

function getWriteContract(provider: ethers.Eip1193Provider) {
  const browserProvider = new ethers.BrowserProvider(provider)
  return browserProvider.getSigner().then(
    (signer) => new ethers.Contract(CONTRACT_ADDRESS, PREDICTION_REGISTRY_ABI, signer),
  )
}

function getWriteContractWithWallet(wallet: ethers.Wallet) {
  return new ethers.Contract(CONTRACT_ADDRESS, PREDICTION_REGISTRY_ABI, wallet)
}

export function hashPrediction(data: {
  userId: string
  matchId: number
  pick: string
  homeScore?: number | null
  awayScore?: number | null
  cornersPick?: string | null
}): string {
  const raw = JSON.stringify(data)
  return ethers.keccak256(ethers.toUtf8Bytes(raw))
}

export async function submitStorePredictionTx(
  provider: ethers.Eip1193Provider,
  predictionHash: string,
  userId: string,
  matchId: number,
  matchName: string,
  predictionSummary: string,
) {
  const contract = await getWriteContract(provider)
  return contract.storePrediction(predictionHash, userId, BigInt(matchId), matchName, predictionSummary)
}

export async function submitStorePredictionTxWithWallet(
  wallet: ethers.Wallet,
  predictionHash: string,
  userId: string,
  matchId: number,
  matchName: string,
  predictionSummary: string,
) {
  const contract = getWriteContractWithWallet(wallet)
  return contract.storePrediction(predictionHash, userId, BigInt(matchId), matchName, predictionSummary)
}

export async function getUserOnChainPredictions(walletAddress: string) {
  const contract = getReadContract()
  return contract.getUserPredictions(walletAddress)
}

export async function getUserTokenBalance(walletAddress: string) {
  const contract = getTokenContract()
  const balance = await contract.balanceOf(walletAddress)
  return ethers.formatUnits(balance, 18)
}

export async function getUserPOLBalance(walletAddress: string) {
  const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC)
  const balance = await rpcProvider.getBalance(walletAddress)
  return ethers.formatEther(balance)
}

export async function getUnclaimedRewards(walletAddress: string) {
  const contract = getReadContract()
  const amount = await contract.getUnclaimedReward(walletAddress)
  return ethers.formatUnits(amount, 18)
}

export async function claimRewardsTx(provider: ethers.Eip1193Provider) {
  const contract = await getWriteContract(provider)
  return contract.claimRewards()
}

export async function claimRewardsTxWithWallet(wallet: ethers.Wallet) {
  const contract = getWriteContractWithWallet(wallet)
  return contract.claimRewards()
}

export async function isPredictionOnChain(predictionHash: string) {
  const contract = getReadContract()
  try {
    const index = await contract.hashToIndex(predictionHash)
    return index !== BigInt(0)
  } catch {
    return false
  }
}

export async function getPredictionTxHash(predictionHash: string): Promise<string | null> {
  try {
    const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC)
    const topic = ethers.keccak256(ethers.toUtf8Bytes('PredictionStored(address,uint256,bytes32,uint256)'))
    const hashTopic = ethers.zeroPadValue(predictionHash, 32)
    const logs = await rpcProvider.getLogs({
      address: CONTRACT_ADDRESS,
      topics: [topic, null, hashTopic],
      fromBlock: 0,
    })
    if (logs.length > 0) return logs[logs.length - 1].transactionHash
  } catch {}
  return null
}

export async function getSwapRate() {
  const contract = getReadContract()
  const rate = await contract.swapRate()
  return ethers.formatUnits(rate, 18)
}

export async function swapPREDForPOL(predAmount: string, provider: ethers.Eip1193Provider) {
  const browserProvider = new ethers.BrowserProvider(provider)
  const signer = await browserProvider.getSigner()
  const contract = new ethers.Contract(CONTRACT_ADDRESS, PREDICTION_REGISTRY_ABI, signer)
  const amount = ethers.parseUnits(predAmount, 18)

  const tokenContract = new ethers.Contract(TOKEN_ADDRESS, [
    'function approve(address spender, uint256 amount) external returns (bool)',
  ], signer)
  const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, amount)
  await approveTx.wait()

  const tx = await contract.swapPREDForPOL(amount)
  return tx.wait()
}

export async function getContractPOLBalance() {
  const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC)
  const balance = await rpcProvider.getBalance(CONTRACT_ADDRESS)
  return ethers.formatEther(balance)
}

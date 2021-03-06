import sleep from 'sleep-promise'
import { execCmd } from './cmd-utils'
import { confirmAction, envVar, fetchEnv, fetchEnvOrFallback } from './env-utils'
import {
  AccountType,
  generateGenesisFromEnv,
  generatePrivateKey,
  generatePublicKey,
  getAddressFromEnv,
  privateKeyToAddress,
  privateKeyToPublicKey
} from './generate_utils'
import {
  applyTerraformModule,
  destroyTerraformModule,
  getTerraformModuleOutputs,
  initTerraformModule,
  planTerraformModule,
  showTerraformModulePlan,
  taintTerraformModuleResource,
  TerraformVars,
  untaintTerraformModuleResource
} from './terraform'
import {
  getGenesisBlockFromGoogleStorage,
  getProxiesPerValidator,
  getProxyName,
  uploadDataToGoogleStorage,
  uploadTestnetInfoToGoogleStorage
} from './testnet-utils'

export interface ProxyIndex {
  validatorIndex: number
  proxyIndex: number
}

// Keys = gcloud project name
const projectConfig = {
  'celo-testnet': {
    secretsBucketName: 'celo-testnet-secrets',
    stateBucketName: 'celo_tf_state',
  },
  'celo-testnet-production': {
    secretsBucketName: 'celo-testnet-secrets-prod',
    stateBucketName: 'celo_tf_state_prod',
  },
}

const testnetTerraformModule = 'testnet'
const testnetNetworkTerraformModule = 'testnet-network'

interface NodeSecrets {
  ACCOUNT_ADDRESS: string
  BOOTNODE_ENODE_ADDRESS: string
  PRIVATE_KEY: string
  PROXIED_VALIDATOR_ADDRESS?: string
  PROXY_ENODE_ADDRESSES?: string
  [envVar.GETH_ACCOUNT_SECRET]: string
  [envVar.MNEMONIC]: string
}

// The keys correspond to the variable names that Terraform expects and
// the values correspond to the names of the appropriate env variables
const testnetEnvVars: TerraformVars = {
  block_time: envVar.BLOCK_TIME,
  celo_env: envVar.CELOTOOL_CELOENV,
  gcloud_credentials_path: envVar.GOOGLE_APPLICATION_CREDENTIALS,
  gcloud_project: envVar.TESTNET_PROJECT_NAME,
  geth_verbosity: envVar.GETH_VERBOSITY,
  geth_bootnode_docker_image_repository: envVar.GETH_BOOTNODE_DOCKER_IMAGE_REPOSITORY,
  geth_bootnode_docker_image_tag: envVar.GETH_BOOTNODE_DOCKER_IMAGE_TAG,
  geth_metrics: envVar.GETH_ENABLE_METRICS,
  geth_node_docker_image_repository: envVar.GETH_NODE_DOCKER_IMAGE_REPOSITORY,
  geth_node_docker_image_tag: envVar.GETH_NODE_DOCKER_IMAGE_TAG,
  in_memory_discovery_table: envVar.IN_MEMORY_DISCOVERY_TABLE,
  istanbul_request_timeout_ms: envVar.ISTANBUL_REQUEST_TIMEOUT_MS,
  network_id: envVar.NETWORK_ID,
  private_tx_node_count: envVar.PRIVATE_TX_NODES,
  node_disk_size_gb: envVar.NODE_DISK_SIZE_GB,
  private_node_disk_size_gb: envVar.PRIVATE_NODE_DISK_SIZE_GB,
  tx_node_count: envVar.TX_NODES,
  validator_count: envVar.VALIDATORS,
}

const testnetNetworkEnvVars: TerraformVars = {
  celo_env: envVar.CELOTOOL_CELOENV,
  gcloud_credentials_path: envVar.GOOGLE_APPLICATION_CREDENTIALS,
  gcloud_project: envVar.TESTNET_PROJECT_NAME,
}

// Resources that are tainted when upgrade-resetting
const testnetResourcesToReset = [
  // bootnode
  'module.bootnode.google_compute_instance.bootnode',
  // validators
  'module.validator.google_compute_instance.validator.*',
  'module.validator.google_compute_disk.validator.*',
  // validator proxies
  'module.validator.module.proxy.random_id.full_node.*',
  'module.validator.module.proxy.google_compute_instance.full_node.*',
  'module.validator.module.proxy.random_id.full_node_disk.*',
  'module.validator.module.proxy.google_compute_disk.full_node.*',
  // tx-nodes
  'module.tx_node.random_id.full_node.*',
  'module.tx_node.google_compute_instance.full_node.*',
  'module.tx_node.random_id.full_node_disk.*',
  'module.tx_node.google_compute_disk.full_node.*',
  // private tx-nodes
  'module.tx_node_private.random_id.full_node.*',
  'module.tx_node_private.google_compute_instance.full_node.*',
  'module.tx_node_private.random_id.full_node_disk.*',
  'module.tx_node_private.google_compute_disk.full_node.*',
  // tx-node load balancer instance group
  'module.tx_node_lb.random_id.external',
  'module.tx_node_lb.google_compute_instance_group.external',
  'module.tx_node_lb.random_id.internal',
  'module.tx_node_lb.google_compute_instance_group.internal',
]

export async function deploy(
  celoEnv: string,
  generateSecrets: boolean,
  useExistingGenesis: boolean,
  onConfirmFailed?: () => Promise<void>
) {
  // If we are not using the default network, we want to create/upgrade our network
  if (!useDefaultNetwork()) {
    console.info('First deploying the testnet VPC network')

    const networkVars: TerraformVars = getTestnetNetworkVars(celoEnv)
    await deployModule(celoEnv, testnetNetworkTerraformModule, networkVars, onConfirmFailed)
  }

  const testnetVars: TerraformVars = await getTestnetVars(celoEnv, useExistingGenesis)
  await deployModule(celoEnv, testnetTerraformModule, testnetVars, onConfirmFailed, async () => {
    if (generateSecrets) {
      console.info('Generating and uploading secrets env files to Google Storage...')
      await generateAndUploadSecrets(celoEnv)
    }
  })
  // TODO change this true value
  await uploadTestnetInfoToGoogleStorage(celoEnv, !useExistingGenesis)
}

export async function deployModule(
  celoEnv: string,
  terraformModule: string,
  vars: TerraformVars,
  onConfirmFailed?: () => Promise<void>,
  onConfirmSuccess?: () => Promise<void>
) {
  const backendConfigVars: TerraformVars = getTerraformBackendConfigVars(celoEnv, terraformModule)

  const envType = fetchEnv(envVar.ENV_TYPE)
  console.info(`
    Deploying:
    Terraform Module: ${terraformModule}
    Celo Env: ${celoEnv}
    Environment: ${envType}
  `)

  console.info('Initializing...')
  await initTerraformModule(terraformModule, vars, backendConfigVars)

  console.info('Planning...')
  await planTerraformModule(terraformModule, vars)

  // await showTerraformModulePlan(terraformModule)

  await confirmAction(
    `Are you sure you want to perform the above plan for Celo env ${celoEnv} in environment ${envType}?`,
    onConfirmFailed,
    onConfirmSuccess
  )

  console.info('Applying...')
  await applyTerraformModule(terraformModule)
}

export async function destroy(celoEnv: string) {
  const testnetVars: TerraformVars = await getTestnetVars(celoEnv, true)

  await destroyModule(celoEnv, testnetTerraformModule, testnetVars)

  // If we are not using the default network, we want to destroy our network
  if (!useDefaultNetwork()) {
    console.info('Destroying the testnet VPC network')

    const networkVars: TerraformVars = getTestnetNetworkVars(celoEnv)
    await destroyModule(celoEnv, testnetNetworkTerraformModule, networkVars)
  }
}

export async function destroyModule(celoEnv: string, terraformModule: string, vars: TerraformVars = {}) {
  const backendConfigVars: TerraformVars = getTerraformBackendConfigVars(celoEnv, terraformModule)

  const envType = fetchEnv(envVar.ENV_TYPE)
  console.info(`
    Destroying:
    Terraform Module: ${terraformModule}
    Celo Env: ${celoEnv}
    Environment: ${envType}
  `)

  console.info('Initializing...')
  await initTerraformModule(terraformModule, vars, backendConfigVars)

  console.info('Planning...')
  await planTerraformModule(terraformModule, vars, true)

  await showTerraformModulePlan(terraformModule)

  await confirmAction(`Are you sure you want to destroy ${celoEnv} in environment ${envType}?`)

  await destroyTerraformModule(terraformModule, vars)
}

// force the recreation of various resources upon the next deployment
export async function taintTestnet(celoEnv: string) {
  console.info('Tainting testnet...')
  const vars: TerraformVars = await getTestnetVars(celoEnv, true)
  const backendConfigVars: TerraformVars = getTerraformBackendConfigVars(
    celoEnv,
    testnetTerraformModule
  )
  await initTerraformModule(testnetTerraformModule, vars, backendConfigVars)

  for (const resource of testnetResourcesToReset) {
    console.info(`Tainting ${resource}`)
    await taintTerraformModuleResource(testnetTerraformModule, resource)
    // To avoid getting errors for too many gcloud storage API requests
    await sleep(2000)
  }
}

export async function untaintTestnet(celoEnv: string) {
  console.info('Untainting testnet...')
  const vars: TerraformVars = await getTestnetVars(celoEnv, true)
  const backendConfigVars: TerraformVars = getTerraformBackendConfigVars(
    celoEnv,
    testnetTerraformModule
  )
  await initTerraformModule(testnetTerraformModule, vars, backendConfigVars)

  for (const resource of testnetResourcesToReset) {
    console.info(`Untainting ${resource}`)
    await untaintTerraformModuleResource(testnetTerraformModule, resource)
    // To avoid getting errors for too many gcloud storage API requests
    await sleep(2000)
  }
}

export async function getTestnetOutputs(celoEnv: string) {
  const vars: TerraformVars = await getTestnetVars(celoEnv, true)
  const backendConfigVars: TerraformVars = getTerraformBackendConfigVars(
    celoEnv,
    testnetTerraformModule
  )
  await initTerraformModule(testnetTerraformModule, vars, backendConfigVars)
  return getTerraformModuleOutputs(testnetTerraformModule, vars)
}

export async function getInternalTxNodeLoadBalancerIP(celoEnv: string) {
  const fullCmd = getInternalTxNodeLoadBalancerIpCommand(celoEnv)
  const [output] = await execCmd(fullCmd)
  return output.trim()
}

export async function getInternalValidatorIPs(celoEnv: string) {
  const outputs = await getTestnetOutputs(celoEnv)
  return outputs.validator_internal_ip_addresses.value
}

export async function getInternalProxyIPs(celoEnv: string) {
  const outputs = await getTestnetOutputs(celoEnv)
  return outputs.proxy_internal_ip_addresses.value
}

export async function getInternalTxNodeIPs(celoEnv: string) {
  const outputs = await getTestnetOutputs(celoEnv)
  return outputs.tx_node_internal_ip_addresses.value
}

export function getTerraformBackendConfigVars(celoEnv: string, terraformModule: string) {
  return {
    bucket: stateBucketName(),
    prefix: `${celoEnv}/${terraformModule}`,
  }
}

async function getTestnetVars(celoEnv: string, useExistingGenesis: boolean) {
  const genesisContent = useExistingGenesis
    ? await getGenesisBlockFromGoogleStorage(celoEnv)
    : generateGenesisFromEnv()

  const genesisBuffer = Buffer.from(genesisContent)
  const domainName = fetchEnv(envVar.CLUSTER_DOMAIN_NAME)
  return {
    ...getEnvVarValues(testnetEnvVars),
    // Cloud DNS for our domains only lives in celo-testnet
    dns_gcloud_project: 'celo-testnet',
    dns_zone_name: dnsZoneName(domainName),
    ethstats_host: `${celoEnv}-ethstats.${domainName}.org`,
    forno_host: `${celoEnv}-forno.${domainName}.org`,
    gcloud_secrets_bucket: secretsBucketName(),
    gcloud_secrets_base_path: secretsBasePath(celoEnv),
    // only able to view objects for accessing secrets & modify ssl certs for forno setup
    gcloud_vm_service_account_email: `terraform-testnet@${fetchEnv(
      envVar.TESTNET_PROJECT_NAME
    )}.iam.gserviceaccount.com`,
    genesis_content_base64: genesisBuffer.toString('base64'),
    // forno is the name for our setup that has tx-nodes reachable via a domain name
    letsencrypt_email: 'n@celo.org',
    network_name: networkName(celoEnv),
    proxies_per_validator: JSON.stringify(getProxiesPerValidator()),
  }
}

function getTestnetNetworkVars(celoEnv: string): TerraformVars {
  return {
    ...getEnvVarValues(testnetNetworkEnvVars),
    network_name: networkName(celoEnv),
  }
}

function getEnvVarValues(terraformEnvVars: TerraformVars) {
  const vars: { [key: string]: string } = {}
  for (const key of Object.keys(terraformEnvVars)) {
    vars[key] = fetchEnv(terraformEnvVars[key])
  }
  return vars
}

export async function generateAndUploadSecrets(celoEnv: string) {
  // Bootnode
  const bootnodeSecrets = generateBootnodeSecretEnvVars()
  await uploadSecrets(celoEnv, bootnodeSecrets, 'bootnode')
  // Tx Nodes
  const txNodeCount = parseInt(fetchEnv(envVar.TX_NODES), 10)
  for (let i = 0; i < txNodeCount; i++) {
    const secrets = generateNodeSecretEnvVars(AccountType.TX_NODE, i)
    await uploadSecrets(celoEnv, secrets, `tx-node-${i}`)
  }
  // Private tx Nodes
  const privateTxNodeCount = parseInt(fetchEnv(envVar.PRIVATE_TX_NODES), 10)
  for (let i = 0; i < privateTxNodeCount; i++) {
    // Ensure there is no overlap with tx node keys
    const secrets = generateNodeSecretEnvVars(AccountType.TX_NODE, i, 1000 + i)
    await uploadSecrets(celoEnv, secrets, `tx-node-private-${i}`)
  }
  // Validators
  const validatorCount = parseInt(fetchEnv(envVar.VALIDATORS), 10)
  for (let i = 0; i < validatorCount; i++) {
    const secrets = generateNodeSecretEnvVars(AccountType.VALIDATOR, i)
    await uploadSecrets(celoEnv, secrets, `validator-${i}`)
  }
  // Proxies
  const proxiesPerValidator = getProxiesPerValidator()
  let validatorIndex = 0
  for (const proxyCount of proxiesPerValidator) {
    for (let i = 0; i < proxyCount; i++) {
      const secrets = generateProxySecretEnvVars(validatorIndex, i)
      await uploadSecrets(celoEnv, secrets, `validator-${validatorIndex}-proxy-${i}`)
    }
    validatorIndex++
  }
}

function uploadSecrets(celoEnv: string, secrets: string, resourceName: string) {
  const cloudStorageFileName = `${secretsBasePath(celoEnv)}/.env.${resourceName}`
  return uploadDataToGoogleStorage(
    secrets,
    secretsBucketName(),
    cloudStorageFileName,
    false,
    'text/plain'
  )
}

function generateBootnodeSecretEnvVars() {
  const mnemonic = fetchEnv(envVar.MNEMONIC)
  return formatEnvVars({
    NODE_KEY: generatePrivateKey(mnemonic, AccountType.BOOTNODE, 0),
  })
}

function generateNodeSecretEnvVars(
  accountType: AccountType,
  index: number,
  keyIndex: number = index
) {
  const mnemonic = fetchEnv(envVar.MNEMONIC)
  const privateKey = generatePrivateKey(mnemonic, accountType, keyIndex)
  const secrets = getNodeSecrets(privateKey)
  // If this is meant to be a proxied validator, also generate the enode of its proxy
  if (accountType === AccountType.VALIDATOR) {
    const proxiesPerValidator = getProxiesPerValidator()
    if (index < proxiesPerValidator.length) {
      const proxyEnodeAddresses = []
      for (let proxyIndex = 0; proxyIndex < proxiesPerValidator[index]; proxyIndex++) {
        proxyEnodeAddresses.push(privateKeyToPublicKey(generateProxyPrivateKey(index, proxyIndex)))
      }
      secrets.PROXY_ENODE_ADDRESSES = proxyEnodeAddresses.join(',')
    }
  }
  return formatEnvVars(secrets)
}

function generateProxySecretEnvVars(validatorIndex: number, proxyIndex: number) {
  const privateKey = generateProxyPrivateKey(validatorIndex, proxyIndex)
  const secrets = getNodeSecrets(privateKey)
  secrets.PROXIED_VALIDATOR_ADDRESS = getAddressFromEnv(AccountType.VALIDATOR, validatorIndex)
  return formatEnvVars(secrets)
}

function generateProxyPrivateKey(validatorIndex: number, proxyIndex: number) {
  const mnemonic = fetchEnv(envVar.MNEMONIC)
  // To allow a validator to have many proxies and to be able to easily
  // adjust the number of proxies it has, the following index is calculated
  const index = validatorIndex * 10000 + proxyIndex
  return generatePrivateKey(mnemonic, AccountType.PROXY, index)
}

function getNodeSecrets(privateKey: string): NodeSecrets {
  const mnemonic = fetchEnv(envVar.MNEMONIC)
  return {
    ACCOUNT_ADDRESS: privateKeyToAddress(privateKey),
    BOOTNODE_ENODE_ADDRESS: generatePublicKey(mnemonic, AccountType.BOOTNODE, 0),
    PRIVATE_KEY: privateKey,
    [envVar.GETH_ACCOUNT_SECRET]: fetchEnv(envVar.GETH_ACCOUNT_SECRET),
    [envVar.MNEMONIC]: mnemonic,
  }
}

// Formats an object into a multi-line string with each line as KEY=VALUE
function formatEnvVars(envVars: { [key: string]: any }) {
  return Object.keys(envVars)
    .map((key) => `${key}='${envVars[key]}'`)
    .join('\n')
}

function secretsBasePath(celoEnv: string) {
  return `vm/${celoEnv}`
}

function useDefaultNetwork() {
  return (
    fetchEnvOrFallback(envVar.VM_BASED, 'false') !== 'true' ||
    fetchEnv(envVar.KUBERNETES_CLUSTER_NAME) === 'celo-networks-dev'
  )
}

export function networkName(celoEnv: string) {
  return useDefaultNetwork() ? 'default' : `${celoEnv}-network`
}

function secretsBucketName() {
  const config = configForProject()
  return config.secretsBucketName
}

function stateBucketName() {
  const config = configForProject()
  return config.stateBucketName
}

function configForProject() {
  const project = fetchEnv(envVar.TESTNET_PROJECT_NAME)
  if (!projectConfig.hasOwnProperty(project)) {
    throw new Error(`No config for project ${project}`)
  }
  // @ts-ignore - we check above to see if the property exists
  return projectConfig[project]
}

// name of the DNS zone in Google Cloud for a particular domain
function dnsZoneName(domain: string) {
  return `${domain}-org`
}

export function getVmSshCommand(instanceName: string) {
  const project = fetchEnv(envVar.TESTNET_PROJECT_NAME)
  const zone = fetchEnv(envVar.KUBERNETES_CLUSTER_ZONE)
  return `gcloud beta compute --project '${project}' ssh --zone '${zone}' ${instanceName} --tunnel-through-iap`
}

export function getInternalTxNodeLoadBalancerIpCommand(celoEnv: string) {
  const project = fetchEnv(envVar.TESTNET_PROJECT_NAME)
  return `gcloud compute forwarding-rules list --project '${project}' --filter="name~'${celoEnv}-tx-node-lb-internal-fwd-rule'" --format='get(IPAddress)'`
}

export async function getNodeVmName(
  celoEnv: string,
  nodeType: string,
  index?: number | ProxyIndex
) {
  const nodeTypesWithRandomSuffixes = ['tx-node', 'tx-node-private', 'proxy']
  const nodeTypesWithNoIndex = ['bootnode']
  let instanceName
  if (nodeTypesWithRandomSuffixes.includes(nodeType)) {
    instanceName = await getNodeVmNameWithRandomSuffix(celoEnv, nodeType, index || 0)
  } else {
    instanceName = `${celoEnv}-${nodeType}`
    if (!nodeTypesWithNoIndex.includes(nodeType) && index !== undefined) {
      instanceName += `-${index}`
    }
  }
  return instanceName
}

// Some VM names have a randomly generated suffix. This returns the full name
// of the instance given only the celoEnv and index.
async function getNodeVmNameWithRandomSuffix(
  celoEnv: string,
  nodeType: string,
  index: number | ProxyIndex
) {
  const project = fetchEnv(envVar.TESTNET_PROJECT_NAME)

  const baseName =
    typeof index === 'number'
      ? `${celoEnv}-${nodeType}-${index}`
      : getProxyName(celoEnv, index.validatorIndex, index.proxyIndex)

  const [nodeName] = await execCmd(
    `gcloud compute instances list --project '${project}' --filter="NAME ~ ${baseName}-.*" --format get\\(NAME\\)`
  )
  return nodeName.trim()
}

// indexCoercer is a yargs coercer that parses numeric indices and colon-separated
// indices (<validator index>:<proxy index>) into a ProxyIndex type.
export function indexCoercer(value: string) {
  if (!value) {
    return value
  }
  const splitValues = value.split(':').filter((v) => v)
  // Then it's just a single index number
  if (splitValues.length === 1) {
    return parseInt(value, 10)
  } else if (splitValues.length === 2) {
    const parsedValues = splitValues.map((v) => parseInt(v, 10))
    const proxyIndex: ProxyIndex = {
      validatorIndex: parsedValues[0],
      proxyIndex: parsedValues[1],
    }
    return proxyIndex
  } else {
    throw new Error('Incorrect index')
  }
}

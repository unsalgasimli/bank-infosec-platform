// Shared vocabulary only. Validation, authorization and material-change rules remain server-side.
export const architectureComponentTypes = ['PROCESS','SERVICE','API','DATABASE','DATASTORE','QUEUE','EXTERNAL_SYSTEM','USER','ADMIN','THIRD_PARTY','NETWORK_ZONE','CLOUD_SERVICE','DEVICE','OTHER','CLIENT','MOBILE_APP','WEB_APP','MICROSERVICE','API_GATEWAY','CACHE','FILE_STORE','OBJECT_STORAGE','HSM_KMS','IDENTITY_PROVIDER'] as const;
export const architectureExposures = ['UNKNOWN','INTERNAL','INTERNET','THIRD_PARTY'] as const;
export const architecturePrivileges = ['UNKNOWN','NONE','STANDARD','PRIVILEGED'] as const;
export const architectureHosting = ['UNKNOWN','ON_PREMISES','PRIVATE_CLOUD','PUBLIC_CLOUD','HYBRID','THIRD_PARTY'] as const;
export const architectureEnvironments = ['UNKNOWN','DEVELOPMENT','TEST','STAGING','PRODUCTION','MIXED'] as const;
export const architectureIntegrity = ['UNKNOWN','NONE','TRANSPORT','MESSAGE','BOTH'] as const;
export const architectureLogging = ['UNKNOWN','NONE','METADATA','SECURITY_EVENTS','FULL'] as const;

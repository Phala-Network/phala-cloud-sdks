import { z } from "zod";

export const VmInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  uptime: z.string(),
  app_url: z.string().nullable(),
  app_id: z.string(),
  instance_id: z.string().nullable(),
  configuration: z.any().optional(), // TODO: add VmConfiguration schema if needed
  exited_at: z.string().nullable(),
  boot_progress: z.string().nullable(),
  boot_error: z.string().nullable(),
  shutdown_progress: z.string().nullable(),
  image_version: z.string().nullable(),
});

export const ManagedUserSchema = z.object({
  id: z.number(),
  username: z.string(),
});

export const CvmNodeSchema = z.object({
  id: z.number(),
  name: z.string(),
  region_identifier: z.string().optional(),
});

export const CvmNetworkUrlsSchema = z.object({
  app: z.string(),
  instance: z.string(),
});

export const KMSInfoSchema = z.object({
  id: z.string(), // HashedId is represented as string in JS
  slug: z.string(),
  url: z.string(),
  version: z.string(),
  chain_id: z.number().optional(),
  kms_contract_address: z.string().optional(),
  gateway_app_id: z.string().optional(),
});

export const CvmInfoSchema = z
  .object({
    hosted: VmInfoSchema,
    name: z.string(),
    managed_user: ManagedUserSchema.optional().nullable(),
    node: CvmNodeSchema.optional().nullable(),
    listed: z.boolean().default(false),
    status: z.string(),
    in_progress: z.boolean().default(false),
    dapp_dashboard_url: z.string().nullable(),
    syslog_endpoint: z.string().nullable(),
    allow_upgrade: z.boolean().default(false),
    project_id: z.string().nullable(), // HashedId is represented as string in JS
    project_type: z.string().nullable(),
    billing_period: z.string().nullable(),
    kms_info: KMSInfoSchema.nullable(),
    vcpu: z.number().nullable(),
    memory: z.number().nullable(),
    disk_size: z.number().nullable(),
    gateway_domain: z.string().nullable(),
    public_urls: z.array(CvmNetworkUrlsSchema),
  })
  .partial();

export type CvmInfo = z.infer<typeof CvmInfoSchema>;

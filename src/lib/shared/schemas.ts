import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().min(1).max(64);

export const deviceSchema = z.object({
	id: z.uuid(),
	name: z.string().trim().min(1).max(120),
	serial: z.string().trim().max(120).default(''),
	deviceTypeId: id,
	categoryId: id.nullable().default(null),
	statusId: id,
	lat: z.number().min(-90).max(90),
	lon: z.number().min(-180).max(180),
	siteName: z.string().trim().max(160).default(''),
	siteGroup: z.string().trim().max(160).default(''),
	deployedOn: isoDate.nullable().default(null),
	lastServiceOn: isoDate.nullable().default(null),
	retrievalDueOn: isoDate.nullable().default(null),
	notes: z.string().max(5000).default(''),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
	deletedAt: z.number().int().nonnegative().nullable().default(null)
});
export type DeviceInput = z.infer<typeof deviceSchema>;

export const statusEventSchema = z.object({
	id: z.uuid(),
	deviceId: z.uuid(),
	oldStatusId: id.nullable(),
	newStatusId: id,
	comment: z.string().max(1000).default(''),
	createdAt: z.number().int().nonnegative()
});
export type StatusEventInput = z.infer<typeof statusEventSchema>;

export const locationEventSchema = z.object({
	id: z.uuid(),
	deviceId: z.uuid(),
	lat: z.number().min(-90).max(90),
	lon: z.number().min(-180).max(180),
	siteName: z.string().trim().max(160).default(''),
	recordedAt: z.number().int().nonnegative()
});
export type LocationEventInput = z.infer<typeof locationEventSchema>;

export const mutationSchema = z.discriminatedUnion('kind', [
	z.object({ id: z.uuid(), kind: z.literal('device.upsert'), device: deviceSchema }),
	z.object({ id: z.uuid(), kind: z.literal('status.add'), event: statusEventSchema }),
	z.object({ id: z.uuid(), kind: z.literal('location.add'), event: locationEventSchema })
]);
export type Mutation = z.infer<typeof mutationSchema>;

export const pushRequestSchema = z.object({ mutations: z.array(z.unknown()).max(200) });

export type MutationResult = {
	id: string;
	result: 'applied' | 'duplicate' | 'stale' | 'rejected';
	reason?: string;
};

export const deviceTypeSchema = z.object({
	id: id,
	name: z.string().trim().min(1).max(80),
	description: z.string().max(500).default(''),
	icon: z.string().min(1).max(8),
	color
});
export const categorySchema = z.object({
	id: id,
	name: z.string().trim().min(1).max(80),
	color,
	icon: z.string().min(1).max(8),
	deviceTypeId: id.nullable().default(null)
});
export const statusSchema = z.object({
	id: id,
	name: z.string().trim().min(1).max(80),
	color,
	icon: z.string().min(1).max(8),
	sortOrder: z.number().int().min(0).max(1000).default(0)
});
export const settingsSchema = z.object({
	maintenanceDays: z.coerce.number().int().min(1).max(3650),
	rotationDate: z.union([isoDate, z.literal('')])
});
export type Settings = z.infer<typeof settingsSchema>;

export const userCreateSchema = z.object({
	username: z
		.string()
		.trim()
		.min(3)
		.max(64)
		.regex(/^[a-zA-Z0-9._-]+$/),
	password: z.string().min(10).max(256),
	role: z.enum(['admin', 'user'])
});

export interface RefRow {
	id: string;
	name: string;
	color: string;
	icon: string;
	updatedAt: number;
	deletedAt: number | null;
	seq: number;
}
export interface DeviceTypeRow extends RefRow {
	description: string;
}
export interface CategoryRow extends RefRow {
	deviceTypeId: string | null;
}
export interface StatusRow extends RefRow {
	sortOrder: number;
	key: string | null;
}
export interface DeviceRow extends DeviceInput {
	updatedBy: string;
	seq: number;
}
export interface StatusEventRow extends StatusEventInput {
	userId: string;
	seq: number;
}
export interface LocationEventRow extends LocationEventInput {
	userId: string;
	seq: number;
}
export interface PhotoRow {
	id: string;
	deviceId: string;
	mime: string;
	createdAt: number;
	userId: string;
	seq: number;
}
export interface PullResponse {
	cursor: number;
	hasMore: boolean;
	serverTime: number;
	settings: Settings;
	users: Record<string, string>;
	changes: {
		devices: DeviceRow[];
		deviceTypes: DeviceTypeRow[];
		categories: CategoryRow[];
		statuses: StatusRow[];
		statusHistory: StatusEventRow[];
		locationHistory: LocationEventRow[];
		photos: PhotoRow[];
	};
}

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
	disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at').notNull()
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull(),
	csrfToken: text('csrf_token').notNull()
});

export const loginAttempts = sqliteTable('login_attempts', {
	key: text('key').primaryKey(),
	count: integer('count').notNull(),
	windowStart: integer('window_start').notNull()
});

export const counters = sqliteTable('counters', {
	name: text('name').primaryKey(),
	value: integer('value').notNull()
});

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const deviceTypes = sqliteTable('device_types', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description').notNull().default(''),
	icon: text('icon').notNull().default('📟'),
	color: text('color').notNull().default('#1b5e20'),
	updatedAt: integer('updated_at').notNull(),
	deletedAt: integer('deleted_at'),
	seq: integer('seq').notNull()
});

export const categories = sqliteTable('categories', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	color: text('color').notNull().default('#1b5e20'),
	icon: text('icon').notNull().default('📍'),
	deviceTypeId: text('device_type_id').references(() => deviceTypes.id),
	updatedAt: integer('updated_at').notNull(),
	deletedAt: integer('deleted_at'),
	seq: integer('seq').notNull()
});

export const statuses = sqliteTable('statuses', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	color: text('color').notNull(),
	icon: text('icon').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	key: text('key'),
	updatedAt: integer('updated_at').notNull(),
	deletedAt: integer('deleted_at'),
	seq: integer('seq').notNull()
});

export const devices = sqliteTable(
	'devices',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		serial: text('serial').notNull().default(''),
		deviceTypeId: text('device_type_id').notNull(),
		categoryId: text('category_id'),
		statusId: text('status_id').notNull(),
		lat: real('lat').notNull(),
		lon: real('lon').notNull(),
		siteName: text('site_name').notNull().default(''),
		siteGroup: text('site_group').notNull().default(''),
		deployedOn: text('deployed_on'),
		lastServiceOn: text('last_service_on'),
		retrievalDueOn: text('retrieval_due_on'),
		notes: text('notes').notNull().default(''),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull(),
		updatedBy: text('updated_by').notNull(),
		deletedAt: integer('deleted_at'),
		seq: integer('seq').notNull()
	},
	(t) => [index('devices_seq').on(t.seq), index('devices_status').on(t.statusId)]
);

export const locationHistory = sqliteTable(
	'location_history',
	{
		id: text('id').primaryKey(),
		deviceId: text('device_id').notNull(),
		lat: real('lat').notNull(),
		lon: real('lon').notNull(),
		siteName: text('site_name').notNull().default(''),
		recordedAt: integer('recorded_at').notNull(),
		userId: text('user_id').notNull(),
		seq: integer('seq').notNull()
	},
	(t) => [index('lochist_device').on(t.deviceId), index('lochist_seq').on(t.seq)]
);

export const statusHistory = sqliteTable(
	'status_history',
	{
		id: text('id').primaryKey(),
		deviceId: text('device_id').notNull(),
		oldStatusId: text('old_status_id'),
		newStatusId: text('new_status_id').notNull(),
		comment: text('comment').notNull().default(''),
		userId: text('user_id').notNull(),
		createdAt: integer('created_at').notNull(),
		seq: integer('seq').notNull()
	},
	(t) => [index('stathist_device').on(t.deviceId), index('stathist_seq').on(t.seq)]
);

export const photos = sqliteTable('photos', {
	id: text('id').primaryKey(),
	deviceId: text('device_id').notNull(),
	mime: text('mime').notNull(),
	file: text('file').notNull(),
	createdAt: integer('created_at').notNull(),
	userId: text('user_id').notNull(),
	seq: integer('seq').notNull()
});

export const appliedMutations = sqliteTable('applied_mutations', {
	mutationId: text('mutation_id').primaryKey(),
	userId: text('user_id').notNull(),
	appliedAt: integer('applied_at').notNull()
});

export const accessLog = sqliteTable(
	'access_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		at: integer('at').notNull(),
		event: text('event', {
			enum: ['login', 'login_failed', 'login_throttled', 'logout']
		}).notNull(),
		username: text('username').notNull(),
		userId: text('user_id'),
		ip: text('ip').notNull().default(''),
		userAgent: text('user_agent').notNull().default('')
	},
	(t) => [index('access_at').on(t.at)]
);

export const activityLog = sqliteTable(
	'activity_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		at: integer('at').notNull(),
		receivedAt: integer('received_at').notNull(),
		userId: text('user_id').notNull(),
		action: text('action').notNull(),
		entity: text('entity').notNull(),
		entityId: text('entity_id').notNull().default(''),
		label: text('label').notNull().default(''),
		detail: text('detail').notNull().default('')
	},
	(t) => [index('activity_at').on(t.at), index('activity_entity').on(t.entity, t.entityId)]
);

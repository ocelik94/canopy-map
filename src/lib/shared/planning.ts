import type { DeviceTypeRow, StatusRow } from './schemas.ts';

export interface PlanDevice {
	id: string;
	name: string;
	statusId: string;
	deviceTypeId: string;
	siteName: string;
	siteGroup: string;
	deployedOn: string | null;
	lastServiceOn: string | null;
	retrievalDueOn: string | null;
	createdAt: number;
	deletedAt: number | null;
}
type StatusLike = Pick<StatusRow, 'id' | 'key'>;

const DAY = 86_400_000;
const EXCLUDED_FROM_SERVICE = ['retrieved', 'lost', 'planned'];

export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayNum = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);

export function daysBetween(fromIso: string, toIso: string): number {
	return dayNum(toIso) - dayNum(fromIso);
}

export function lastServiceReference(d: PlanDevice): string {
	return d.lastServiceOn ?? d.deployedOn ?? isoDay(d.createdAt);
}

export interface DueDevice<T> {
	device: T;
	daysSince: number;
	neverServiced: boolean;
}

export function devicesDueForService<T extends PlanDevice>(
	devices: T[],
	today: string,
	days: number,
	statuses: StatusLike[] = []
): DueDevice<T>[] {
	const excluded = new Set(
		statuses.filter((s) => s.key && EXCLUDED_FROM_SERVICE.includes(s.key)).map((s) => s.id)
	);
	return devices
		.filter((d) => !d.deletedAt && !excluded.has(d.statusId))
		.map((d) => ({
			device: d,
			daysSince: daysBetween(lastServiceReference(d), today),
			neverServiced: !d.lastServiceOn
		}))
		.filter((x) => x.daysSince >= days)
		.sort((a, b) => b.daysSince - a.daysSince || a.device.name.localeCompare(b.device.name));
}

export function groupByStatus<T extends { device: { statusId: string } } | { statusId: string }>(
	items: T[]
): Map<string, T[]> {
	const out = new Map<string, T[]>();
	for (const it of items) {
		const sid = 'device' in it ? it.device.statusId : it.statusId;
		(out.get(sid) ?? out.set(sid, []).get(sid)!).push(it);
	}
	return out;
}

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
	const out = new Map<string, T[]>();
	for (const it of items) {
		const k = key(it);
		(out.get(k) ?? out.set(k, []).get(k)!).push(it);
	}
	return out;
}

export function isMobileType(type: Pick<DeviceTypeRow, 'id' | 'name'> | undefined, typeId: string) {
	return typeId === 'type-mobile' || !!type?.name.toLowerCase().includes('mobile');
}

export interface RotationItem<T> {
	device: T;
	overdueDays: number;
	dueOn: string | null;
}

export function rotationDue<T extends PlanDevice>(
	devices: T[],
	types: Pick<DeviceTypeRow, 'id' | 'name'>[],
	dueDate: string,
	statuses: StatusLike[] = []
): RotationItem<T>[] {
	const typeById = new Map(types.map((t) => [t.id, t]));
	const retrieved = new Set(statuses.filter((s) => s.key === 'retrieved').map((s) => s.id));
	return devices
		.filter((d) => !d.deletedAt && !retrieved.has(d.statusId))
		.filter((d) => isMobileType(typeById.get(d.deviceTypeId), d.deviceTypeId))
		.filter((d) => (d.retrievalDueOn ? d.retrievalDueOn <= dueDate : !!d.deployedOn))
		.map((d) => ({
			device: d,
			dueOn: d.retrievalDueOn,
			overdueDays: d.retrievalDueOn ? daysBetween(d.retrievalDueOn, dueDate) : 0
		}))
		.sort((a, b) => b.overdueDays - a.overdueDays || a.device.name.localeCompare(b.device.name));
}

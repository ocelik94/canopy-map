<script lang="ts">
	import { goto } from '$app/navigation';
	import { app, live } from '#lib/client/app.svelte.ts';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import AdminLogs from '#lib/components/AdminLogs.svelte';
	import { t } from '#lib/strings.ts';

	const s = t.ops.admin;
	type Tab = 'users' | 'types' | 'categories' | 'statuses' | 'settings' | 'access' | 'activity';
	const TABS: Tab[] = [
		'users',
		'types',
		'categories',
		'statuses',
		'settings',
		'activity',
		'access'
	];
	let tab = $state<Tab>('users');
	let error = $state('');
	let info = $state('');

	$effect(() => {
		if (app.ready && app.user && app.user.role !== 'admin') void goto('/');
	});

	const types = live(() => app.db.deviceTypes.toArray(), []);
	const categories = live(() => app.db.categories.toArray(), []);
	const statuses = live(() => app.db.statuses.toArray(), []);
	const typeList = $derived(
		types.value.filter((x) => !x.deletedAt).sort((a, b) => a.name.localeCompare(b.name))
	);
	const catList = $derived(
		categories.value.filter((x) => !x.deletedAt).sort((a, b) => a.name.localeCompare(b.name))
	);
	const statusList = $derived(
		statuses.value
			.filter((x) => !x.deletedAt)
			.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
	);

	async function api(method: string, url: string, body?: unknown): Promise<any> {
		error = info = '';
		try {
			const res = await fetch(url, {
				method,
				headers: { 'x-csrf-token': app.csrf, 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				error =
					res.status === 409
						? s.errExists
						: res.status === 400
							? s.errInvalid
							: res.status === 401 || res.status === 403
								? s.errForbidden
								: s.errGeneric(res.status);
				return null;
			}
			return j;
		} catch {
			error = s.needsConnection;
			return null;
		}
	}

	type Entity = 'types' | 'categories' | 'statuses';
	interface Draft {
		id: string;
		name: string;
		description: string;
		color: string;
		icon: string;
		sortOrder: number;
		deviceTypeId: string;
	}
	const blank = (): Draft => ({
		id: '',
		name: '',
		description: '',
		color: '#2e7d32',
		icon: '📍',
		sortOrder: 0,
		deviceTypeId: ''
	});
	let editing = $state<{ entity: Entity; draft: Draft } | null>(null);

	function startEdit(entity: Entity, row?: any) {
		editing = {
			entity,
			draft: row
				? {
						...blank(),
						...row,
						description: row.description ?? '',
						deviceTypeId: row.deviceTypeId ?? ''
					}
				: blank()
		};
		error = info = '';
	}
	async function saveRef() {
		if (!editing) return;
		const { entity, draft: d } = editing;
		const id = d.id || crypto.randomUUID();
		const body =
			entity === 'types'
				? { id, name: d.name, description: d.description, icon: d.icon, color: d.color }
				: entity === 'categories'
					? { id, name: d.name, color: d.color, icon: d.icon, deviceTypeId: d.deviceTypeId || null }
					: { id, name: d.name, color: d.color, icon: d.icon, sortOrder: Number(d.sortOrder) || 0 };
		if (await api('PUT', `/api/admin/${entity}`, body)) {
			editing = null;
			info = s.saved;
			await app.engine.sync();
		}
	}
	async function removeRef(entity: Entity, row: { id: string; name: string }) {
		if (!confirm(s.confirmDelete(row.name))) return;
		if (await api('DELETE', `/api/admin/${entity}?id=${encodeURIComponent(row.id)}`)) {
			await app.engine.sync();
		}
	}

	interface UserRow {
		id: string;
		username: string;
		role: 'admin' | 'user';
		disabled: boolean | number;
	}
	let users = $state<UserRow[]>([]);
	let newUser = $state({ username: '', password: '', role: 'user' as 'admin' | 'user' });
	let resetFor = $state<string | null>(null);
	let resetPw = $state('');
	async function loadUsers() {
		const j = await api('GET', '/api/admin/users');
		if (j) users = j.users;
	}
	async function createUser() {
		if (await api('POST', '/api/admin/users', newUser)) {
			newUser = { username: '', password: '', role: 'user' };
			info = s.saved;
			await loadUsers();
		}
	}
	async function patchUser(id: string, patch: Record<string, unknown>) {
		if (await api('PATCH', '/api/admin/users', { id, ...patch })) {
			info = s.saved;
			resetFor = null;
			resetPw = '';
			await loadUsers();
		}
	}

	let cfg = $state({ maintenanceDays: 90, rotationDate: '' });
	let cfgLoaded = false;
	$effect(() => {
		if (cfgLoaded) return;
		cfgLoaded = true;
		void app.settings().then((v) => (cfg = { ...v }));
	});
	async function saveSettings() {
		const j = await api('PUT', '/api/admin/settings', {
			maintenanceDays: Number(cfg.maintenanceDays),
			rotationDate: cfg.rotationDate
		});
		if (j) {
			info = s.saved;
			await app.engine.sync();
		}
	}

	$effect(() => {
		if (tab === 'users' && app.csrf) void loadUsers();
	});
	const typeName = (id: string | null) => typeList.find((x) => x.id === id)?.name ?? '';
</script>

{#snippet refForm()}
	{#if editing}
		{@const d = editing.draft}
		<form
			class="card form"
			onsubmit={(e) => {
				e.preventDefault();
				void saveRef();
			}}
		>
			<h2>{d.id ? s.edit : s.add}</h2>
			<label>{s.name}<input bind:value={d.name} required maxlength="80" /></label>
			{#if editing.entity === 'types'}
				<label>{s.description}<input bind:value={d.description} maxlength="500" /></label>
			{/if}
			{#if editing.entity === 'categories'}
				<label>
					{s.deviceType}
					<select bind:value={d.deviceTypeId}>
						<option value="">{s.anyType}</option>
						{#each typeList as ty (ty.id)}<option value={ty.id}>{ty.name}</option>{/each}
					</select>
				</label>
			{/if}
			{#if editing.entity === 'statuses'}
				<label>
					{s.sortOrder}
					<input type="number" min="0" max="1000" bind:value={d.sortOrder} />
				</label>
			{/if}
			<div class="pair">
				<label>{s.icon}<input bind:value={d.icon} required maxlength="8" /></label>
				<label>{s.color}<input type="color" bind:value={d.color} class="color" /></label>
			</div>
			<div class="preview">
				<span class="eyebrow">{s.preview}</span>
				<span class="glyph" style:--c={d.color} aria-hidden="true">{d.icon}</span>
				<span class="tags"><StatusBadge color={d.color} name={d.name || '…'} /></span>
			</div>
			<div class="buttons">
				<button class="btn primary" type="submit">{s.save}</button>
				<button class="btn" type="button" onclick={() => (editing = null)}>{s.cancel}</button>
			</div>
		</form>
	{/if}
{/snippet}

{#snippet refList(entity: Entity, rows: any[])}
	{#if editing?.entity === entity}
		{@render refForm()}
	{:else}
		<div class="toolbar">
			<button class="btn primary" type="button" onclick={() => startEdit(entity)}>
				<Icon name="plus" size={20} />
				{s.add}
			</button>
		</div>
	{/if}
	{#if !rows.length}<p class="notice">{s.empty}</p>{/if}
	<ul class="rows">
		{#each rows as r (r.id)}
			<li class="row-card item">
				<span class="glyph" style:--c={r.color} aria-hidden="true">{r.icon}</span>
				<span class="grow">
					<span class="title">{r.name}</span>
					{#if entity === 'categories' && r.deviceTypeId}
						<span class="sub">{typeName(r.deviceTypeId)}</span>
					{:else if entity === 'statuses'}
						<span class="sub num">{s.sortOrderShort(r.sortOrder)}</span>
					{:else if entity === 'types' && r.description}
						<span class="sub">{r.description}</span>
					{/if}
				</span>
				<span class="tags"><StatusBadge color={r.color} name={r.name} /></span>
				<span class="actions">
					<button class="btn ghost" type="button" onclick={() => startEdit(entity, r)}>
						<Icon name="edit" size={18} />
						{s.edit}
					</button>
					<button class="btn ghost danger-text" type="button" onclick={() => removeRef(entity, r)}>
						<Icon name="trash" size={18} />
						{s.delete}
					</button>
				</span>
			</li>
		{/each}
	</ul>
{/snippet}

{#if app.user?.role === 'admin'}
	<div class="page">
		<header class="page-head">
			<h1>{s.title}</h1>
			<p>{s.subtitle}</p>
		</header>
		<div class="segmented" role="tablist">
			{#each TABS as k (k)}
				<button
					role="tab"
					aria-selected={tab === k}
					onclick={(e) => {
						e.currentTarget.scrollIntoView({
							block: 'nearest',
							inline: 'nearest',
							behavior: 'smooth'
						});
						tab = k;
						editing = null;
						error = info = '';
					}}
				>
					{s[k]}
				</button>
			{/each}
		</div>
		{#if error}<p class="notice err" role="alert">{error}</p>{/if}
		{#if info}<p class="notice ok" role="status">{info}</p>{/if}

		{#if tab === 'users'}
			<form
				class="card form"
				onsubmit={(e) => {
					e.preventDefault();
					void createUser();
				}}
			>
				<h2>{s.newUser}</h2>
				<div class="pair">
					<label
						>{s.username}<input
							bind:value={newUser.username}
							required
							minlength="3"
							autocomplete="off"
						/></label
					>
					<label>
						{s.role}
						<select bind:value={newUser.role}>
							<option value="user">{s.user}</option>
							<option value="admin">{s.admin}</option>
						</select>
					</label>
				</div>
				<label>
					{s.password}
					<input
						type="password"
						bind:value={newUser.password}
						required
						minlength="10"
						autocomplete="new-password"
					/>
				</label>
				<div class="buttons">
					<button class="btn primary" type="submit">{s.createUser}</button>
				</div>
			</form>
			<ul class="rows">
				{#each users as u (u.id)}
					<li class="row-card item">
						<span class="glyph user" aria-hidden="true"><Icon name="user" size={20} /></span>
						<span class="grow">
							<span class="title">{u.username}</span>
							<span class="tags">
								<span class="badge"
									><span class="label">{u.role === 'admin' ? s.admin : s.user}</span></span
								>
								{#if u.disabled}
									<span class="badge" style:--c="var(--danger)"
										><span class="label">{s.disabled}</span></span
									>
								{/if}
							</span>
						</span>
						<span class="actions">
							<select
								aria-label={s.role}
								value={u.role}
								onchange={(e) => patchUser(u.id, { role: e.currentTarget.value })}
							>
								<option value="user">{s.user}</option>
								<option value="admin">{s.admin}</option>
							</select>
							<button
								class="btn ghost"
								class:danger-text={!u.disabled}
								type="button"
								onclick={() => patchUser(u.id, { disabled: !u.disabled })}
							>
								{u.disabled ? s.enable : s.disable}
							</button>
							<button
								class="btn ghost"
								type="button"
								aria-expanded={resetFor === u.id}
								onclick={() => (resetFor = resetFor === u.id ? null : u.id)}
							>
								{s.resetPassword}
							</button>
						</span>
						{#if resetFor === u.id}
							<form
								class="reset"
								onsubmit={(e) => {
									e.preventDefault();
									void patchUser(u.id, { password: resetPw });
								}}
							>
								<input
									type="password"
									aria-label={s.newPassword}
									placeholder={s.newPassword}
									bind:value={resetPw}
									minlength="10"
									required
									autocomplete="new-password"
								/>
								<button class="btn primary" type="submit">{s.save}</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{:else if tab === 'types'}
			{@render refList('types', typeList)}
		{:else if tab === 'categories'}
			{@render refList('categories', catList)}
		{:else if tab === 'statuses'}
			{@render refList('statuses', statusList)}
		{:else if tab === 'activity' || tab === 'access'}
			{#key tab}<AdminLogs kind={tab} />{/key}
		{:else}
			<form
				class="card form"
				onsubmit={(e) => {
					e.preventDefault();
					void saveSettings();
				}}
			>
				<h2>{s.settings}</h2>
				<div class="pair">
					<label>
						{s.maintenanceDays}
						<input type="number" min="1" max="3650" bind:value={cfg.maintenanceDays} required />
					</label>
					<label>{s.rotationDate}<input type="date" bind:value={cfg.rotationDate} /></label>
				</div>
				<div class="buttons">
					<button class="btn primary" type="submit">{s.save}</button>
				</div>
			</form>
		{/if}
		<p class="foot">{s.needsConnection}</p>
	</div>
{/if}

<style>
	.notice {
		margin: 0 0 14px;
	}
	.form {
		margin: 0 0 16px;
	}
	.form h2 {
		margin: 0 0 4px;
		font-size: 1.1rem;
	}
	.pair {
		display: grid;
		gap: 0 12px;
	}
	@media (min-width: 560px) {
		.pair {
			grid-template-columns: 1fr 1fr;
		}
	}
	.pair label {
		min-width: 0;
	}
	.color {
		cursor: pointer;
	}
	.preview {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin-top: 14px;
		padding: 12px 14px;
		background: var(--surface);
		border-radius: var(--radius-sm);
	}
	.preview .tags {
		flex: 1 1 0;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 18px;
	}
	.toolbar {
		margin: 0 0 14px;
	}
	.glyph {
		--c: var(--muted);
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		font-size: 1.2rem;
		line-height: 1;
		border-radius: 10px;
		background: #eef1ee;
		background: color-mix(in srgb, var(--c) 16%, white);
		border: 1px solid color-mix(in srgb, var(--c) 35%, white);
	}
	.glyph.user {
		color: var(--muted);
		background: var(--surface);
		border-color: var(--line);
	}
	.item .grow {
		flex: 1 1 140px;
	}
	.item .grow .tags {
		margin-top: 6px;
	}
	.item > .tags {
		flex: 0 1 auto;
		max-width: 100%;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}
	.actions select {
		width: auto;
		min-width: 7.5em;
		margin: 0;
	}
	.actions .btn {
		padding: 8px 12px;
		font-size: 0.95rem;
	}
	.danger-text {
		color: var(--danger);
	}
	.btn.ghost.danger-text:hover {
		background: var(--danger-soft);
	}
	@media (max-width: 599px) {
		.actions {
			flex: 1 1 100%;
			margin: 2px 0 0;
			padding-top: 8px;
			border-top: 1px solid var(--line);
		}
		.actions > * {
			flex: 1 1 auto;
		}
		.item > .tags {
			display: none;
		}
	}
	.reset {
		display: flex;
		flex: 1 1 100%;
		gap: 8px;
	}
	.reset input {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
	}
	.reset .btn {
		flex: none;
	}
	.foot {
		margin: 20px 0 0;
		font-size: 0.9rem;
		color: var(--muted);
	}
</style>

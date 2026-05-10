interface Env {
	API_BASE_URL: string;
	ADMIN_SECRET: string;
}

export default {
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		const url = `${env.API_BASE_URL}/api/admin/rotate-prompt`;
		ctx.waitUntil(
			fetch(url, {
				method: 'POST',
				headers: { 'x-admin-secret': env.ADMIN_SECRET }
			}).then(async (res) => {
				const body = await res.text().catch(() => '');
				console.log('rotate-prompt', res.status, body.slice(0, 200));
			})
		);
	}
};

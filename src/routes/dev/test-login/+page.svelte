<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
	import { dev } from '$app/environment';

	let username = $state('');
	let isLoading = $state(false);
	let error = $state('');

	async function handleTestLogin() {
		if (!username.trim()) {
			error = 'Please enter a username';
			return;
		}

		isLoading = true;
		error = '';

		try {
			const response = await fetch('/api/dev/test-login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: username.trim().toLowerCase() })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Login failed');
			}

			// Redirect to home page
			await goto('/');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed';
		} finally {
			isLoading = false;
		}
	}

	// Quick login buttons for common test users
	const testUsers = ['alice', 'bob', 'charlie', 'diana', 'eve'];

	async function quickLogin(user: string) {
		username = user;
		await handleTestLogin();
	}
</script>

{#if !dev}
	<div class="min-h-screen flex items-center justify-center bg-gray-50">
		<Card class="w-full max-w-md">
			<CardHeader>
				<CardTitle>Not Available</CardTitle>
				<CardDescription>Test login is only available in development mode</CardDescription>
			</CardHeader>
		</Card>
	</div>
{:else}
	<div class="min-h-screen flex items-center justify-center bg-gray-50 p-4">
		<Card class="w-full max-w-md">
			<CardHeader>
				<CardTitle>🧪 Test Login</CardTitle>
				<CardDescription>
					Development-only login. Enter any username to create/login as a test user.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<form onsubmit={(e) => { e.preventDefault(); handleTestLogin(); }} class="space-y-4">
					<div>
						<label for="username" class="block text-sm font-medium mb-2">
							Username
						</label>
						<Input
							id="username"
							type="text"
							bind:value={username}
							placeholder="Enter username (e.g., alice)"
							disabled={isLoading}
							class="w-full"
						/>
					</div>

					{#if error}
						<div class="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
							{error}
						</div>
					{/if}

					<Button type="submit" disabled={isLoading || !username.trim()} class="w-full">
						{isLoading ? 'Logging in...' : 'Login as Test User'}
					</Button>
				</form>

				<div class="relative">
					<div class="absolute inset-0 flex items-center">
						<span class="w-full border-t"></span>
					</div>
					<div class="relative flex justify-center text-xs uppercase">
						<span class="bg-white px-2 text-gray-500">Quick Login</span>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-2">
					{#each testUsers as user}
						<Button
							variant="outline"
							size="sm"
							onclick={() => quickLogin(user)}
							disabled={isLoading}
						>
							{user}
						</Button>
					{/each}
				</div>

				<div class="text-xs text-gray-500 text-center pt-4 border-t">
					<p>💡 This creates test users without Google OAuth</p>
					<p class="mt-1">Users are stored in the database like real users</p>
				</div>
			</CardContent>
		</Card>
	</div>
{/if}


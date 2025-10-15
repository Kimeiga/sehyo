<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Check } from 'lucide-svelte';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	let friendshipStatus = $state<
		'none' | 'friends' | 'request_sent' | 'request_received' | 'rejected'
	>('none');
	let friendshipId = $state<string | null>(null);
	let isLoading = $state(false);

	onMount(async () => {
		await checkFriendshipStatus();
	});

	async function checkFriendshipStatus() {
		try {
			const response = await fetch(`/api/friends/check?user_id=${userId}`);
			const data = await response.json();
			friendshipStatus = data.status;
			friendshipId = data.friendship?.id || null;
		} catch (error) {
			console.error('Error checking friendship status:', error);
		}
	}

	async function sendFriendRequest() {
		isLoading = true;
		try {
			const response = await fetch('/api/friends', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ friend_id: userId })
			});

			if (response.ok) {
				await checkFriendshipStatus();
			} else {
				const error = await response.json();
				alert(error.message || 'Failed to send friend request');
			}
		} catch (error) {
			console.error('Error sending friend request:', error);
			alert('Failed to send friend request');
		} finally {
			isLoading = false;
		}
	}

	async function acceptRequest() {
		if (!friendshipId) return;

		isLoading = true;
		try {
			const response = await fetch(`/api/friends/${friendshipId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'accept' })
			});

			if (response.ok) {
				await checkFriendshipStatus();
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error accepting request:', error);
		} finally {
			isLoading = false;
		}
	}

	async function rejectRequest() {
		if (!friendshipId) return;

		isLoading = true;
		try {
			const response = await fetch(`/api/friends/${friendshipId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'reject' })
			});

			if (response.ok) {
				await checkFriendshipStatus();
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error rejecting request:', error);
		} finally {
			isLoading = false;
		}
	}

	async function removeFriend() {
		if (!friendshipId) return;

		if (!confirm('Are you sure you want to remove this friend?')) {
			return;
		}

		isLoading = true;
		try {
			const response = await fetch(`/api/friends/${friendshipId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await checkFriendshipStatus();
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error removing friend:', error);
		} finally {
			isLoading = false;
		}
	}

	async function cancelRequest() {
		if (!friendshipId) return;

		isLoading = true;
		try {
			const response = await fetch(`/api/friends/${friendshipId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await checkFriendshipStatus();
			}
		} catch (error) {
			console.error('Error canceling request:', error);
		} finally {
			isLoading = false;
		}
	}
</script>

{#if friendshipStatus === 'none'}
	<Button onclick={sendFriendRequest} disabled={isLoading}>
		{isLoading ? 'Sending...' : 'Add Friend'}
	</Button>
{:else if friendshipStatus === 'friends'}
	<Button variant="secondary" onclick={removeFriend} disabled={isLoading}>
		{#if isLoading}
			Removing...
		{:else}
			<Check class="size-4 mr-1" />
			Friends
		{/if}
	</Button>
{:else if friendshipStatus === 'request_sent'}
	<Button variant="secondary" onclick={cancelRequest} disabled={isLoading}>
		{isLoading ? 'Canceling...' : 'Request Sent'}
	</Button>
{:else if friendshipStatus === 'request_received'}
	<div class="flex gap-2">
		<Button onclick={acceptRequest} disabled={isLoading}>
			{isLoading ? 'Accepting...' : 'Accept'}
		</Button>
		<Button variant="secondary" onclick={rejectRequest} disabled={isLoading}>
			{isLoading ? 'Rejecting...' : 'Reject'}
		</Button>
	</div>
{/if}


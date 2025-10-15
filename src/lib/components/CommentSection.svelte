<script lang="ts">
	import Comment from './Comment.svelte';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		postId: string;
		currentUserId?: string;
	}

	let { postId, currentUserId }: Props = $props();

	let comments = $state<any[]>([]);
	let newComment = $state('');
	let isSubmitting = $state(false);
	let isLoading = $state(false);
	let showComments = $state(true); // Auto-show comments when component mounts

	// Auto-load comments when component mounts
	onMount(() => {
		loadComments();
	});

	async function loadComments() {
		if (isLoading) return;

		isLoading = true;

		try {
			const response = await fetch(`/api/posts/${postId}/comments`);
			if (!response.ok) throw new Error('Failed to load comments');

			const data = await response.json();
			comments = data.comments || [];
		} catch (err) {
			console.error('Failed to load comments:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleSubmit() {
		if (!newComment.trim()) return;

		isSubmitting = true;

		try {
			const response = await fetch(`/api/posts/${postId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: newComment.trim() })
			});

			if (!response.ok) throw new Error('Failed to post comment');

			newComment = '';
			await loadComments();
			showComments = true;
		} catch (err) {
			alert('Failed to post comment');
		} finally {
			isSubmitting = false;
		}
	}

	async function toggleComments() {
		showComments = !showComments;
		if (showComments && comments.length === 0) {
			await loadComments();
		}
	}
</script>

<div class="border-t pt-3">
	<!-- Comment Input -->
	<div class="flex gap-2 mb-3">
		<Input
			type="text"
			bind:value={newComment}
			placeholder="Write a comment..."
			class="rounded-full"
			disabled={isSubmitting}
			onkeydown={(e) => e.key === 'Enter' && handleSubmit()}
		/>
		<Button
			onclick={handleSubmit}
			disabled={isSubmitting || !newComment.trim()}
			class="rounded-full"
		>
			{isSubmitting ? 'Posting...' : 'Post'}
		</Button>
	</div>

	<!-- Toggle Comments Button -->
	{#if comments.length > 0}
		<Button
			variant="ghost"
			size="sm"
			onclick={toggleComments}
			class="h-auto p-0 text-sm hover:underline mb-2"
		>
			{showComments ? 'Hide' : 'View'} {comments.length} comment{comments.length !== 1 ? 's' : ''}
		</Button>
	{/if}

	<!-- Comments List -->
	{#if showComments}
		<div class="space-y-3">
			{#if isLoading}
				<p class="text-sm text-muted-foreground">Loading comments...</p>
			{:else if comments.length > 0}
				{#each comments.filter((c) => !c.parent_comment_id) as comment}
					<Comment {comment} {currentUserId} {postId} />
				{/each}
			{:else}
				<p class="text-sm text-muted-foreground">No comments yet</p>
			{/if}
		</div>
	{/if}
</div>


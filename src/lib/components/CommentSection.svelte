<script lang="ts">
	import Comment from './Comment.svelte';
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
	let showAllComments = $state(false); // Show only 2-3 comments by default
	const INITIAL_COMMENT_COUNT = 2; // Show 2 comments initially
	let lastLoadedPostId = '';

	// Load comments when postId changes
	$effect(() => {
		// Only reload if postId actually changed
		if (postId !== lastLoadedPostId) {
			lastLoadedPostId = postId;
			comments = []; // Clear old comments
			showAllComments = false; // Reset view state
			loadComments();
		}
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
			showAllComments = true; // Show all comments after posting
		} catch (err) {
			alert('Failed to post comment');
		} finally {
			isSubmitting = false;
		}
	}

	// Get top-level comments (no parent)
	const topLevelComments = $derived(comments.filter((c) => !c.parent_comment_id));

	// Comments to display (either first 2 or all)
	const displayedComments = $derived(
		showAllComments ? topLevelComments : topLevelComments.slice(0, INITIAL_COMMENT_COUNT)
	);

	// Check if there are more comments to show
	const hasMoreComments = $derived(topLevelComments.length > INITIAL_COMMENT_COUNT);
</script>

<div class="border-t pt-3" data-post-id={postId}>
	<!-- Comment Input or Sign-in Prompt -->
	{#if currentUserId}
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
	{:else}
		<!-- Sign-in prompt for non-authenticated users -->
		<div class="flex gap-2 mb-3 p-3 bg-muted/50 rounded-lg">
			<p class="text-sm text-muted-foreground flex-1">
				<a href="/auth/login" class="text-primary hover:underline font-medium">Sign in</a> to write a comment
			</p>
		</div>
	{/if}

	<!-- Comments List (always visible) -->
	<div class="space-y-3">
		{#if isLoading}
			<p class="text-sm text-muted-foreground">Loading comments...</p>
		{:else if topLevelComments.length > 0}
			{#each displayedComments as comment}
				<Comment {comment} {currentUserId} {postId} />
			{/each}

			<!-- "View more comments" button -->
			{#if hasMoreComments && !showAllComments}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => (showAllComments = true)}
					class="h-auto p-0 text-sm hover:underline text-muted-foreground"
				>
					View {topLevelComments.length - INITIAL_COMMENT_COUNT} more comment{topLevelComments.length - INITIAL_COMMENT_COUNT !== 1 ? 's' : ''}
				</Button>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground">No comments yet</p>
		{/if}
	</div>
</div>


<script lang="ts">
	import type { Post as PostType } from '$lib/types';
	import { invalidateAll } from '$app/navigation';
	import ReactionPicker from './ReactionPicker.svelte';
	import CommentSection from './CommentSection.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Trash2, MessageCircle, Share2 } from 'lucide-svelte';

	interface Props {
		post: PostType & {
			user?: {
				id: string;
				display_name: string;
				profile_picture_url?: string | null;
			};
			reaction_counts?: {
				total: number;
				like?: number;
				love?: number;
				haha?: number;
				wow?: number;
				sad?: number;
				angry?: number;
			};
		};
		currentUserId?: string;
	}

	let { post, currentUserId }: Props = $props();

	let isDeleting = $state(false);
	let showComments = $state(false);

	async function handleDelete() {
		if (!confirm('Are you sure you want to delete this post?')) {
			return;
		}

		isDeleting = true;

		try {
			const response = await fetch(`/api/posts/${post.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete post');
			}

			// Refresh the feed
			await invalidateAll();
		} catch (err) {
			alert('Failed to delete post');
			isDeleting = false;
		}
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;

		return date.toLocaleDateString();
	}
</script>

<Card class="mb-4">
	<CardContent class="pt-6">
		<!-- Post Header -->
		<div class="flex items-start justify-between mb-4">
			<a href="/profile/{post.user_id}" class="flex items-center gap-3 hover:underline">
				<Avatar>
					<AvatarImage src={post.user?.profile_picture_url} alt={post.user?.display_name} />
					<AvatarFallback>
						{post.user?.display_name?.charAt(0).toUpperCase() || '?'}
					</AvatarFallback>
				</Avatar>
				<div>
					<p class="font-semibold">{post.user?.display_name || 'Unknown User'}</p>
					<p class="text-sm text-muted-foreground">
						{formatDate(post.created_at)}
					</p>
				</div>
			</a>

			{#if currentUserId === post.user_id}
				<Button
					variant="ghost"
					size="icon-sm"
					onclick={handleDelete}
					disabled={isDeleting}
					class="text-muted-foreground hover:text-destructive"
				>
					<Trash2 class="size-4" />
				</Button>
			{/if}
		</div>

		<!-- Post Content -->
		<p class="mb-4 whitespace-pre-wrap">{post.content}</p>

		<!-- Post Image -->
		{#if post.image_url}
			<img src={post.image_url} alt="Post" class="w-full rounded-lg mb-4" />
		{/if}

		<!-- Reaction Counts -->
		{#if post.reaction_counts && post.reaction_counts.total > 0}
			<div class="flex items-center gap-2 text-sm text-muted-foreground mb-3">
				<Badge variant="secondary" class="gap-1">
					👍 {post.reaction_counts.total}
				</Badge>
			</div>
		{/if}

		<Separator class="my-3" />

		<!-- Action Buttons -->
		<div class="flex items-center gap-2">
			<ReactionPicker targetType="post" targetId={post.id} reactionCounts={post.reaction_counts} />

			<Button
				variant="ghost"
				size="sm"
				onclick={() => (showComments = !showComments)}
				class="gap-2"
			>
				<MessageCircle class="size-4" />
				<span>Comment</span>
			</Button>

			<Button variant="ghost" size="sm" class="gap-2">
				<Share2 class="size-4" />
				<span>Share</span>
			</Button>
		</div>

		<!-- Comments Section -->
		{#if showComments}
			<Separator class="my-4" />
			<CommentSection postId={post.id} {currentUserId} />
		{/if}
	</CardContent>
</Card>


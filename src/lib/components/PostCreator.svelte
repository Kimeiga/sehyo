<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { ImageIcon, X } from 'lucide-svelte';

	interface Props {
		user: {
			display_name: string;
			profile_picture_url?: string | null;
		};
	}

	let { user }: Props = $props();

	let content = $state('');
	let imageFile: File | null = $state(null);
	let imagePreview: string | null = $state(null);
	let isSubmitting = $state(false);
	let error = $state('');
	let fileInput: HTMLInputElement;

	function handleImageSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];

		if (file) {
			if (file.size > 10 * 1024 * 1024) {
				error = 'Image is too large (max 10MB)';
				return;
			}

			const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
			if (!allowedTypes.includes(file.type)) {
				error = 'Invalid image type. Allowed: JPEG, PNG, GIF, WebP';
				return;
			}

			imageFile = file;
			error = '';

			// Create preview
			const reader = new FileReader();
			reader.onload = (e) => {
				imagePreview = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		}
	}

	function removeImage() {
		imageFile = null;
		imagePreview = null;
		if (fileInput) {
			fileInput.value = '';
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (!content.trim()) {
			error = 'Please write something';
			return;
		}

		if (content.length > 5000) {
			error = 'Post is too long (max 5000 characters)';
			return;
		}

		isSubmitting = true;

		try {
			const formData = new FormData();
			formData.append('content', content.trim());
			if (imageFile) {
				formData.append('image', imageFile);
			}

			const response = await fetch('/api/posts', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to create post');
			}

			// Reset form
			content = '';
			imageFile = null;
			imagePreview = null;
			if (fileInput) {
				fileInput.value = '';
			}

			// Refresh the feed
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create post';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<Card class="mb-6">
	<CardContent class="pt-6">
		<form onsubmit={handleSubmit}>
			<div class="flex gap-3">
				<Avatar>
					<AvatarImage src={user.profile_picture_url} alt={user.display_name} />
					<AvatarFallback>{user.display_name?.charAt(0).toUpperCase() || '?'}</AvatarFallback>
				</Avatar>
				<div class="flex-1">
					<Textarea
						bind:value={content}
						placeholder="What's on your mind?"
						rows={3}
						disabled={isSubmitting}
						class="resize-none"
					/>

					{#if imagePreview}
						<div class="mt-3 relative">
							<img src={imagePreview} alt="Preview" class="max-h-64 rounded-lg" />
							<Button
								type="button"
								variant="destructive"
								size="icon-sm"
								onclick={removeImage}
								disabled={isSubmitting}
								class="absolute top-2 right-2"
							>
								<X class="size-4" />
							</Button>
						</div>
					{/if}

					{#if error}
						<div class="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
							{error}
						</div>
					{/if}

					<div class="mt-3 flex items-center justify-between border-t pt-3">
						<div class="flex items-center gap-2">
							<input
								type="file"
								accept="image/jpeg,image/png,image/gif,image/webp"
								onchange={handleImageSelect}
								bind:this={fileInput}
								class="hidden"
								id="image-upload"
								disabled={isSubmitting}
							/>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onclick={() => fileInput?.click()}
								disabled={isSubmitting}
							>
								<ImageIcon class="size-4" />
								Photo
							</Button>
						</div>

						<Button type="submit" disabled={isSubmitting || !content.trim()}>
							{isSubmitting ? 'Posting...' : 'Post'}
						</Button>
					</div>
				</div>
			</div>
		</form>
	</CardContent>
</Card>


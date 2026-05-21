<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import SpriteSelector from '$lib/components/SpriteSelector.svelte';

	let { data, form }: PageProps = $props();

	let displayName = $state(data.user?.name || '');
	let username = $state(data.user?.username || '');
	let bio = $state(data.user?.bio || '');
	let location = $state(data.user?.location || '');
	let website = $state(data.user?.website || '');

	let profilePicturePreview = $state(data.user?.image || '');
	let coverImagePreview = $state(data.user?.cover_image_url || '');

	let isSubmitting = $state(false);
	let uploadingProfilePic = $state(false);
	let uploadingCover = $state(false);
	let showSpriteSelector = $state(false);

	function handleProfilePictureChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e) => {
				profilePicturePreview = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		}
	}

	function handleCoverImageChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e) => {
				coverImagePreview = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		}
	}
</script>

<div class="container mx-auto max-w-2xl px-4 py-8">
	<div class="rounded-lg border border-border bg-card p-6 shadow">
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-3xl font-bold text-foreground">Edit Profile</h1>
			<a href="/profile/{data.user?.id}" class="text-primary hover:underline"> View Profile </a>
		</div>

		{#if form?.error}
			<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
				{form.error}
			</div>
		{/if}

		{#if form?.success}
			<div class="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
				Profile updated successfully!
			</div>
		{/if}

		<!-- Cover Image Upload -->
		<div class="mb-6">
			<label for="cover_image" class="mb-2 block text-sm font-semibold">Cover Image</label>
			<form
				method="POST"
				action="?/uploadCoverImage"
				enctype="multipart/form-data"
				use:enhance={() => {
					uploadingCover = true;
					return async ({ result, update }) => {
						uploadingCover = false;
						await update();
						if (result.type === 'success') {
							await invalidateAll();
						}
					};
				}}
			>
				{#if coverImagePreview}
					<div
						class="mb-2 h-48 rounded-lg bg-cover bg-center"
						style="background-image: url('{coverImagePreview}')"
					></div>
				{:else}
					<div class="mb-2 h-48 rounded-lg bg-gradient-to-r from-blue-400 to-purple-500"></div>
				{/if}
				<input
					id="cover_image"
					type="file"
					name="cover_image"
					accept="image/jpeg,image/png,image/gif,image/webp"
					onchange={handleCoverImageChange}
					class="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20"
					disabled={uploadingCover}
				/>
				<button
					type="submit"
					disabled={uploadingCover}
					class="mt-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
				>
					{uploadingCover ? 'Uploading...' : 'Upload Cover Image'}
				</button>
			</form>
		</div>

		<!-- Profile Picture Upload -->
		<div class="mb-6">
			<label for="profile_picture" class="mb-2 block text-sm font-semibold">Profile Picture</label>
			<form
				method="POST"
				action="?/uploadProfilePicture"
				enctype="multipart/form-data"
				use:enhance={() => {
					uploadingProfilePic = true;
					return async ({ result, update }) => {
						uploadingProfilePic = false;
						await update();
						if (result.type === 'success') {
							await invalidateAll();
						}
					};
				}}
			>
				<div class="mb-2 flex items-center gap-4">
					{#if profilePicturePreview}
						<img src={profilePicturePreview} alt="Profile" class="h-24 w-24 rounded-full" />
					{:else}
						<div class="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
							<span class="text-3xl font-bold text-muted-foreground">
								{data.user?.name?.charAt(0).toUpperCase() || '?'}
							</span>
						</div>
					{/if}
					<div class="flex-1">
						<input
							id="profile_picture"
							type="file"
							name="profile_picture"
							accept="image/jpeg,image/png,image/gif,image/webp"
							onchange={handleProfilePictureChange}
							class="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20"
							disabled={uploadingProfilePic}
						/>
					</div>
				</div>
				<button
					type="submit"
					disabled={uploadingProfilePic}
					class="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
				>
					{uploadingProfilePic ? 'Uploading...' : 'Upload Profile Picture'}
				</button>
			</form>
		</div>

		<!-- Sprite Selection -->
		<div class="mb-6">
			<p class="mb-2 block text-sm font-semibold">Sprite Avatar</p>
			<div class="flex items-center gap-4">
				{#if data.user?.sprite_id}
					<div class="flex h-16 items-center justify-center">
						<img
							src="/sprites/{data.user.sprite_id}.png"
							alt="Current sprite"
							class="h-full w-auto"
							style="image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges;"
						/>
					</div>
				{:else}
					<div
						class="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-border bg-muted"
					>
						<span class="text-xs text-muted-foreground">No sprite</span>
					</div>
				{/if}
				<button
					type="button"
					onclick={() => (showSpriteSelector = true)}
					class="rounded-lg bg-secondary px-4 py-2 font-semibold text-secondary-foreground transition hover:bg-secondary/80"
				>
					Choose Sprite
				</button>
			</div>
			<p class="mt-2 text-xs text-muted-foreground">
				Your sprite appears as your profile picture in posts and comments
			</p>
		</div>

		<!-- Profile Info Form -->
		<form
			method="POST"
			action="?/updateProfile"
			use:enhance={() => {
				isSubmitting = true;
				return async ({ result, update }) => {
					isSubmitting = false;
					await update();
					if (result.type === 'success') {
						await invalidateAll();
					}
				};
			}}
		>
			<div class="space-y-4">
				<div>
					<label for="display_name" class="mb-1 block text-sm font-semibold">
						Display Name <span class="text-red-500">*</span>
					</label>
					<input
						type="text"
						id="display_name"
						name="display_name"
						bind:value={displayName}
						required
						maxlength="100"
						class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						disabled={isSubmitting}
					/>
				</div>

				<div>
					<label for="username" class="mb-1 block text-sm font-semibold">Username</label>
					<input
						type="text"
						id="username"
						name="username"
						bind:value={username}
						maxlength="50"
						pattern="[a-zA-Z0-9_-]+"
						placeholder="username"
						class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						disabled={isSubmitting}
					/>
					<p class="mt-1 text-xs text-muted-foreground">
						Letters, numbers, underscores, and hyphens only
					</p>
				</div>

				<div>
					<label for="bio" class="mb-1 block text-sm font-semibold">Bio</label>
					<textarea
						id="bio"
						name="bio"
						bind:value={bio}
						maxlength="500"
						rows="4"
						placeholder="Tell us about yourself..."
						class="w-full resize-none rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						disabled={isSubmitting}
					></textarea>
					<p class="mt-1 text-xs text-muted-foreground">{bio.length}/500 characters</p>
				</div>

				<div>
					<label for="location" class="mb-1 block text-sm font-semibold">Location</label>
					<input
						type="text"
						id="location"
						name="location"
						bind:value={location}
						maxlength="100"
						placeholder="City, Country"
						class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						disabled={isSubmitting}
					/>
				</div>

				<div>
					<label for="website" class="mb-1 block text-sm font-semibold">Website</label>
					<input
						type="url"
						id="website"
						name="website"
						bind:value={website}
						maxlength="200"
						placeholder="https://example.com"
						class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						disabled={isSubmitting}
					/>
				</div>
			</div>

			<div class="mt-6 flex gap-3">
				<button
					type="submit"
					disabled={isSubmitting}
					class="rounded-lg bg-primary px-6 py-2 font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSubmitting ? 'Saving...' : 'Save Changes'}
				</button>
				<a
					href="/profile/{data.user?.id}"
					class="rounded-lg bg-secondary px-6 py-2 font-semibold text-secondary-foreground transition hover:bg-secondary/80"
				>
					Cancel
				</a>
			</div>
		</form>
	</div>
</div>

<!-- Sprite Selector Modal -->
<SpriteSelector
	bind:open={showSpriteSelector}
	currentSpriteId={data.user?.sprite_id}
	onClose={() => (showSpriteSelector = false)}
/>

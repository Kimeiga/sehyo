<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import SpriteSelector from '$lib/components/SpriteSelector.svelte';

	let { data, form }: PageProps = $props();

	let displayName = $state(data.user?.display_name || '');
	let username = $state(data.user?.username || '');
	let bio = $state(data.user?.bio || '');
	let location = $state(data.user?.location || '');
	let website = $state(data.user?.website || '');

	let profilePicturePreview = $state(data.user?.profile_picture_url || '');
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

<div class="container mx-auto px-4 py-8 max-w-2xl">
	<div class="bg-card rounded-lg shadow p-6 border border-border">
		<div class="flex items-center justify-between mb-6">
			<h1 class="text-3xl font-bold text-foreground">Edit Profile</h1>
			<a href="/profile/{data.user?.id}" class="text-primary hover:underline">
				View Profile
			</a>
		</div>

		{#if form?.error}
			<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
				{form.error}
			</div>
		{/if}

		{#if form?.success}
			<div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
				Profile updated successfully!
			</div>
		{/if}

		<!-- Cover Image Upload -->
		<div class="mb-6">
			<label class="block text-sm font-semibold mb-2">Cover Image</label>
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
					<div class="h-48 bg-cover bg-center rounded-lg mb-2" style="background-image: url('{coverImagePreview}')"></div>
				{:else}
					<div class="h-48 bg-gradient-to-r from-blue-400 to-purple-500 rounded-lg mb-2"></div>
				{/if}
				<input
					type="file"
					name="cover_image"
					accept="image/jpeg,image/png,image/gif,image/webp"
					onchange={handleCoverImageChange}
					class="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
					disabled={uploadingCover}
				/>
				<button
					type="submit"
					disabled={uploadingCover}
					class="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
				>
					{uploadingCover ? 'Uploading...' : 'Upload Cover Image'}
				</button>
			</form>
		</div>

		<!-- Profile Picture Upload -->
		<div class="mb-6">
			<label class="block text-sm font-semibold mb-2">Profile Picture</label>
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
				<div class="flex items-center gap-4 mb-2">
					{#if profilePicturePreview}
						<img src={profilePicturePreview} alt="Profile" class="w-24 h-24 rounded-full" />
					{:else}
						<div class="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
							<span class="text-3xl text-muted-foreground font-bold">
								{data.user?.display_name?.charAt(0).toUpperCase() || '?'}
							</span>
						</div>
					{/if}
					<div class="flex-1">
						<input
							type="file"
							name="profile_picture"
							accept="image/jpeg,image/png,image/gif,image/webp"
							onchange={handleProfilePictureChange}
							class="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
							disabled={uploadingProfilePic}
						/>
					</div>
				</div>
				<button
					type="submit"
					disabled={uploadingProfilePic}
					class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
				>
					{uploadingProfilePic ? 'Uploading...' : 'Upload Profile Picture'}
				</button>
			</form>
		</div>

		<!-- Sprite Selection -->
		<div class="mb-6">
			<label class="block text-sm font-semibold mb-2">Sprite Avatar</label>
			<div class="flex items-center gap-4">
				{#if data.user?.sprite_id}
					<div class="h-16 flex items-center justify-center">
						<img
							src="/sprites/{data.user.sprite_id}.png"
							alt="Current sprite"
							class="h-full w-auto"
							style="image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges;"
						/>
					</div>
				{:else}
					<div class="w-16 h-16 rounded-lg border-2 border-border bg-muted flex items-center justify-center">
						<span class="text-xs text-muted-foreground">No sprite</span>
					</div>
				{/if}
				<button
					type="button"
					onclick={() => (showSpriteSelector = true)}
					class="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg font-semibold transition"
				>
					Choose Sprite
				</button>
			</div>
			<p class="text-xs text-muted-foreground mt-2">
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
					<label for="display_name" class="block text-sm font-semibold mb-1">
						Display Name <span class="text-red-500">*</span>
					</label>
					<input
						type="text"
						id="display_name"
						name="display_name"
						bind:value={displayName}
						required
						maxlength="100"
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						disabled={isSubmitting}
					/>
				</div>

				<div>
					<label for="username" class="block text-sm font-semibold mb-1">Username</label>
					<input
						type="text"
						id="username"
						name="username"
						bind:value={username}
						maxlength="50"
						pattern="[a-zA-Z0-9_-]+"
						placeholder="username"
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						disabled={isSubmitting}
					/>
					<p class="text-xs text-muted-foreground mt-1">Letters, numbers, underscores, and hyphens only</p>
				</div>

				<div>
					<label for="bio" class="block text-sm font-semibold mb-1">Bio</label>
					<textarea
						id="bio"
						name="bio"
						bind:value={bio}
						maxlength="500"
						rows="4"
						placeholder="Tell us about yourself..."
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
						disabled={isSubmitting}
					></textarea>
					<p class="text-xs text-muted-foreground mt-1">{bio.length}/500 characters</p>
				</div>

				<div>
					<label for="location" class="block text-sm font-semibold mb-1">Location</label>
					<input
						type="text"
						id="location"
						name="location"
						bind:value={location}
						maxlength="100"
						placeholder="City, Country"
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						disabled={isSubmitting}
					/>
				</div>

				<div>
					<label for="website" class="block text-sm font-semibold mb-1">Website</label>
					<input
						type="url"
						id="website"
						name="website"
						bind:value={website}
						maxlength="200"
						placeholder="https://example.com"
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						disabled={isSubmitting}
					/>
				</div>
			</div>

			<div class="mt-6 flex gap-3">
				<button
					type="submit"
					disabled={isSubmitting}
					class="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
				>
					{isSubmitting ? 'Saving...' : 'Save Changes'}
				</button>
				<a
					href="/profile/{data.user?.id}"
					class="px-6 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg font-semibold transition"
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

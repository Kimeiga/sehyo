<script lang="ts">
	import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { invalidateAll } from '$app/navigation';

	interface Props {
		open: boolean;
		currentSpriteId?: number | null;
		onClose: () => void;
	}

	let { open = $bindable(false), currentSpriteId, onClose }: Props = $props();

	let selectedSpriteId = $state(currentSpriteId || 1);
	let isSubmitting = $state(false);

	// Total number of sprites
	const TOTAL_SPRITES = 125;

	// Generate array of sprite IDs
	const spriteIds = Array.from({ length: TOTAL_SPRITES }, (_, i) => i + 1);

	async function handleSelectSprite() {
		isSubmitting = true;

		try {
			const response = await fetch('/profile/edit?/updateSprite', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams({
					sprite_id: selectedSpriteId.toString()
				})
			});

			if (!response.ok) {
				throw new Error('Failed to update sprite');
			}

			// Invalidate all data to refresh the UI
			await invalidateAll();

			// Close the modal
			onClose();
		} catch (err) {
			console.error('Error updating sprite:', err);
			alert('Failed to update sprite. Please try again.');
		} finally {
			isSubmitting = false;
		}
	}
</script>

<Dialog bind:open>
	<DialogContent class="max-w-4xl max-h-[80vh] overflow-y-auto">
		<DialogHeader>
			<DialogTitle>Choose Your Sprite</DialogTitle>
		</DialogHeader>

		<div class="mt-4">
			<!-- Sprite Grid -->
			<div class="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 mb-6">
				{#each spriteIds as spriteId}
					<button
						type="button"
						onclick={() => (selectedSpriteId = spriteId)}
						class="relative h-16 rounded-lg border-2 transition-all hover:scale-110 bg-muted flex items-center justify-center overflow-hidden {selectedSpriteId ===
						spriteId
							? 'border-primary ring-2 ring-primary'
							: 'border-border hover:border-primary/50'}"
					>
						<img
							src="/sprites/{spriteId}.png"
							alt="Sprite {spriteId}"
							class="h-full w-auto"
							style="image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges;"
						/>
					</button>
				{/each}
			</div>

			<!-- Action Buttons -->
			<div class="flex justify-end gap-3">
				<Button variant="outline" onclick={onClose} disabled={isSubmitting}>Cancel</Button>
				<Button onclick={handleSelectSprite} disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : 'Save Sprite'}
				</Button>
			</div>
		</div>
	</DialogContent>
</Dialog>


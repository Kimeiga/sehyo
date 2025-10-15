<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { MessageCircle } from 'lucide-svelte';
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<MessageCircle class="size-6" />
				Messages
			</CardTitle>
		</CardHeader>
		<CardContent>
			<div class="text-center py-12">
				<MessageCircle class="size-16 mx-auto text-muted-foreground mb-4" />
				<h3 class="text-xl font-semibold mb-2">Messages Coming Soon</h3>
				<p class="text-muted-foreground">
					The messaging feature is currently under development. Check back soon!
				</p>
			</div>
		</CardContent>
	</Card>
</div>


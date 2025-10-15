<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import { Dialog, DialogContent } from '$lib/components/ui/dialog';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	let { open = false }: { open?: boolean } = $props();

	// Close modal by removing query parameter
	function closeModal() {
		if (browser) {
			const url = new URL(window.location.href);
			url.searchParams.delete('modal');
			goto(url.toString(), { replaceState: true });
		}
	}
</script>

<Dialog {open} onOpenChange={(isOpen) => { if (!isOpen) closeModal(); }}>
	<DialogContent class="sm:max-w-md">
		<Card class="border-0 shadow-none">
			<CardHeader class="text-center pb-4">
				<div class="w-16 h-16 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
					<span class="text-primary-foreground font-bold text-3xl">f</span>
				</div>
				<CardTitle class="text-2xl">Welcome Back</CardTitle>
				<CardDescription>
					Sign in to create posts and interact with the community
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<!-- Google Sign In -->
				<a href="/api/auth/sign-in/social?provider=google&callbackURL={encodeURIComponent(browser ? window.location.pathname : '/')}" class="block">
					<Button class="w-full" size="lg">
						<svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
							<path
								fill="currentColor"
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
							/>
							<path
								fill="currentColor"
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							/>
							<path
								fill="currentColor"
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							/>
							<path
								fill="currentColor"
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							/>
						</svg>
						Continue with Google
					</Button>
				</a>

				<div class="relative">
					<div class="absolute inset-0 flex items-center">
						<Separator />
					</div>
					<div class="relative flex justify-center text-xs uppercase">
						<span class="bg-card px-2 text-muted-foreground">Or</span>
					</div>
				</div>

				<!-- Browse as Guest -->
				<Button
					variant="outline"
					class="w-full"
					size="lg"
					onclick={closeModal}
				>
					Continue Browsing
				</Button>

				<p class="text-xs text-center text-muted-foreground">
					You can browse posts without signing in.
					<br />
					Sign in with Google to create posts and interact.
				</p>
			</CardContent>
		</Card>
	</DialogContent>
</Dialog>


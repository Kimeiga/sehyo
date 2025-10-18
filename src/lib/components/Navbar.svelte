<script lang="ts">
	import type { User } from '$lib/types';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Home, Users, MessageCircle } from 'lucide-svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import GlobalSearch from '$lib/components/GlobalSearch.svelte';

	interface Props {
		user: User | null;
	}

	let { user }: Props = $props();

	async function handleLogout() {
		try {
			// Use Better Auth sign out
			const res = await fetch('/api/auth/sign-out', {
				method: 'POST',
				credentials: 'include'
			});

			if (res.ok) {
				window.location.href = '/';
			}
		} catch (err) {
			console.error('Logout failed:', err);
		}
	}
</script>

<nav class="bg-card border-b border-border shadow-md sticky top-0 z-50">
	<div class="container mx-auto px-4">
		<div class="flex items-center justify-between h-16">
			<!-- Logo -->
			<a href="/" class="flex items-center gap-2">
				<div class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
					<span class="text-primary-foreground font-bold text-xl">f</span>
				</div>
				<span class="font-bold text-xl hidden sm:block text-foreground">Portfolio Facebook</span>
			</a>

			<!-- Search Bar (always visible) -->
			<div class="flex-1 max-w-md mx-4 hidden md:block">
				<GlobalSearch />
			</div>

			<!-- Navigation Links -->
			<div class="flex items-center gap-2">
				<a href="/" title="Home">
					<Button variant="ghost" size="icon">
						<Home class="size-5" />
					</Button>
				</a>

				{#if user}
					<a href="/friends" title="Friends">
						<Button variant="ghost" size="icon">
							<Users class="size-5" />
						</Button>
					</a>

					<a href="/messages" title="Messages">
						<Button variant="ghost" size="icon">
							<MessageCircle class="size-5" />
						</Button>
					</a>
				{/if}

				<!-- Theme Toggle -->
				<ThemeToggle />

				{#if user}
					<!-- User Menu -->
					<DropdownMenu>
						<DropdownMenuTrigger>
							{#if user.name === 'Anonymous' && user.sprite_id}
								<!-- For anonymous users, show sprite as profile picture -->
								<div class="size-8 flex items-center justify-center cursor-pointer">
									<img
										src="/sprites/{user.sprite_id}.png"
										alt="Sprite"
										class="h-full w-auto"
										style="image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges;"
									/>
								</div>
							{:else}
								<!-- For logged-in users, show regular avatar -->
								<Avatar class="size-8 cursor-pointer">
									<AvatarImage src={user.image} alt={user.name} />
									<AvatarFallback>
										{user.name?.charAt(0).toUpperCase() || '?'}
									</AvatarFallback>
								</Avatar>
							{/if}
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" class="w-64">
							<a href="/profile/{user.id}">
								<DropdownMenuItem class="flex items-center gap-3 cursor-pointer">
									{#if user.name === 'Anonymous' && user.sprite_id}
										<!-- For anonymous users, show sprite as profile picture -->
										<div class="size-10 flex items-center justify-center flex-shrink-0">
											<img
												src="/sprites/{user.sprite_id}.png"
												alt="Sprite"
												class="h-full w-auto"
												style="image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges;"
											/>
										</div>
									{:else}
										<!-- For logged-in users, show regular avatar -->
										<Avatar class="size-10">
											<AvatarImage src={user.image} alt={user.name} />
											<AvatarFallback>
												{user.name?.charAt(0).toUpperCase() || '?'}
											</AvatarFallback>
										</Avatar>
									{/if}
									<div>
										<p class="font-semibold">{user.name}</p>
										<p class="text-sm text-muted-foreground">View profile</p>
									</div>
								</DropdownMenuItem>
							</a>
							<DropdownMenuSeparator />
							<a href="/profile/edit">
								<DropdownMenuItem class="cursor-pointer">
									Edit Profile
								</DropdownMenuItem>
							</a>
							<DropdownMenuItem onclick={handleLogout} class="cursor-pointer">
								Log out
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				{:else}
					<!-- Login Button for non-authenticated users -->
					<a href="?modal=login">
						<Button>Sign in</Button>
					</a>
				{/if}
			</div>
		</div>
	</div>
</nav>


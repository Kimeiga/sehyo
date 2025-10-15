<script lang="ts">
	import type { User } from '$lib/types';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Input } from '$lib/components/ui/input';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Home, Users, MessageCircle } from 'lucide-svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	interface Props {
		user: User | null;
	}

	let { user }: Props = $props();

	async function handleLogout() {
		try {
			await fetch('/auth/logout', {
				method: 'POST'
			});
			window.location.href = '/';
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

			{#if user}
				<!-- Search Bar -->
				<div class="flex-1 max-w-md mx-4 hidden md:block">
					<Input
						type="search"
						placeholder="Search..."
						class="w-full rounded-full bg-muted"
					/>
				</div>

				<!-- Navigation Links -->
				<div class="flex items-center gap-2">
					<a href="/" title="Home">
						<Button variant="ghost" size="icon">
							<Home class="size-5" />
						</Button>
					</a>

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

					<!-- Theme Toggle -->
					<ThemeToggle />

					<!-- User Menu -->
					<DropdownMenu>
						<DropdownMenuTrigger>
							<Avatar class="size-8 cursor-pointer">
								<AvatarImage src={user.profile_picture_url} alt={user.display_name} />
								<AvatarFallback>
									{user.display_name?.charAt(0).toUpperCase() || '?'}
								</AvatarFallback>
							</Avatar>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" class="w-64">
							<a href="/profile/{user.id}">
								<DropdownMenuItem class="flex items-center gap-3 cursor-pointer">
									<Avatar class="size-10">
										<AvatarImage src={user.profile_picture_url} alt={user.display_name} />
										<AvatarFallback>
											{user.display_name?.charAt(0).toUpperCase() || '?'}
										</AvatarFallback>
									</Avatar>
									<div>
										<p class="font-semibold">{user.display_name}</p>
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
				</div>
			{:else}
				<!-- Login Button for non-authenticated users -->
				<a href="/auth/login">
					<Button>Sign in</Button>
				</a>
			{/if}
		</div>
	</div>
</nav>


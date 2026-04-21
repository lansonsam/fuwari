import { getCollection } from "astro:content";

export async function getCategories(): Promise<{ name: string; count: number }[]> {
	const posts = await getSortedPosts();
	const countMap: Record<string, number> = {};
	for (const post of posts) {
		const cat = post.data.category;
		if (cat) {
			countMap[cat] = (countMap[cat] || 0) + 1;
		}
	}
	return Object.entries(countMap)
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);
}

export async function getPostsByCategory(category: string) {
	const posts = await getSortedPosts();
	return posts.filter((p) => p.data.category === category);
}

export async function getSortedPosts() {
	const allBlogPosts = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});
	const sorted = allBlogPosts.sort((a, b) => {
		// 如果一个是置顶一个不是置顶，置顶的排在前面
		if (a.data.pinned !== b.data.pinned) {
			return a.data.pinned ? -1 : 1;
		}
		// 都是置顶或都不是置顶，按发布日期时间排序（包含小时分钟秒）
		const dateA = new Date(a.data.published);
		const dateB = new Date(b.data.published);
		return dateA > dateB ? -1 : 1;
	});

	for (let i = 1; i < sorted.length; i++) {
		sorted[i].data.nextSlug = sorted[i - 1].slug;
		sorted[i].data.nextTitle = sorted[i - 1].data.title;
	}
	for (let i = 0; i < sorted.length - 1; i++) {
		sorted[i].data.prevSlug = sorted[i + 1].slug;
		sorted[i].data.prevTitle = sorted[i + 1].data.title;
	}

	return sorted;
}


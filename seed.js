require('dotenv').config();
const { db } = require('./src/firebase');

async function seedDatabase() {
  try {
    console.log('🌱 Seeding Firestore database...\n');

    // Clear existing data
    console.log('Clearing existing data...');
    const videosSnap = await db.collection('videos').get();
    for (const doc of videosSnap.docs) {
      await doc.ref.delete();
    }
    const categoriesSnap = await db.collection('categories').get();
    for (const doc of categoriesSnap.docs) {
      await doc.ref.delete();
    }
    console.log('✓ Cleared old data\n');

    // Create videos
    const videosData = [
      {
        title: 'Action Movie Demo',
        description: 'An exciting action-packed adventure',
        category: 'Action',
        thumbnailUrl: 'https://via.placeholder.com/300x400?text=Action+Movie',
        muxPlaybackId: 'demo-playback-123',
        duration: 7200,
        views: 0,
      },
      {
        title: 'Comedy Night Live',
        description: 'Hilarious stand-up comedy special',
        category: 'Comedy',
        thumbnailUrl: 'https://via.placeholder.com/300x400?text=Comedy+Show',
        muxPlaybackId: 'demo-playback-124',
        duration: 5400,
        views: 0,
      },
      {
        title: 'Drama Series Premiere',
        description: 'A gripping emotional drama',
        category: 'Drama',
        thumbnailUrl: 'https://via.placeholder.com/300x400?text=Drama+Series',
        muxPlaybackId: 'demo-playback-125',
        duration: 3600,
        views: 0,
      },
    ];

    console.log('Adding videos...');
    for (const video of videosData) {
      const docRef = await db.collection('videos').add(video);
      console.log(`✓ Added video: ${video.title} (${docRef.id})`);
    }

    // Create categories
    const categoriesData = [
      { name: 'Action', icon: '🎬' },
      { name: 'Comedy', icon: '😂' },
      { name: 'Drama', icon: '🎭' },
      { name: 'Horror', icon: '👻' },
      { name: 'Documentary', icon: '📺' },
    ];

    console.log('\nAdding categories...');
    for (const category of categoriesData) {
      const docRef = await db.collection('categories').add(category);
      console.log(`✓ Added category: ${category.name} (${docRef.id})`);
    }

    console.log('\n✅ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();

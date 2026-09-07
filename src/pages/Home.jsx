export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-5xl font-bold mb-4">Welcome to PROtv</h1>
      <p className="text-gray-400 mb-8">Your entertainment, your way.</p>
      <div className="grid grid-cols-4 gap-4">
        {/* Videos will go here */}
        <div className="bg-gray-800 h-48 rounded animate-pulse"></div>
        <div className="bg-gray-800 h-48 rounded animate-pulse"></div>
        <div className="bg-gray-800 h-48 rounded animate-pulse"></div>
        <div className="bg-gray-800 h-48 rounded animate-pulse"></div>
      </div>
    </div>
  )
}

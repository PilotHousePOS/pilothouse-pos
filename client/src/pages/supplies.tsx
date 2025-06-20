import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import SupplyCard from "@/components/supply-card";
import CartSidebar from "@/components/cart-sidebar";

const SUPPLY_CATEGORIES = [
  { id: 'food', label: 'Food', emoji: '🍖' },
  { id: 'toys', label: 'Toys', emoji: '🧸' },
  { id: 'beds', label: 'Beds', emoji: '🛏️' },
  { id: 'leashes', label: 'Leashes', emoji: '🦮' },
  { id: 'healthcare', label: 'Health', emoji: '💊' },
  { id: 'accessories', label: 'Accessories', emoji: '🎀' },
];

export default function Supplies() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);

  const { data: supplies = [], isLoading } = useQuery({
    queryKey: [
      "/api/supplies", 
      ...(selectedCategory ? [`category=${selectedCategory}`] : []),
      ...(searchQuery ? [`search=${searchQuery}`] : [])
    ].filter(Boolean),
  });

  const { data: cartItems = [] } = useQuery({
    queryKey: ["/api/cart"],
  });

  const cartCount = cartItems.length;

  return (
    <div className="px-6 py-4 pb-20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Pet Supplies</h2>
        <Button
          variant="outline"
          className="relative"
          onClick={() => setIsCartOpen(true)}
        >
          🛒 Cart
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-brand-red text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </Button>
      </div>
      
      {/* Search Bar */}
      <div className="relative mb-6">
        <Input
          type="text"
          placeholder="Search supplies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-gray-100 border-none rounded-xl"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {SUPPLY_CATEGORIES.map((category) => (
          <Button
            key={category.id}
            variant="ghost"
            className={`bg-white rounded-xl p-4 text-center shadow-sm hover:shadow-md transition-shadow ${
              selectedCategory === category.id ? 'ring-2 ring-brand-blue' : ''
            }`}
            onClick={() => setSelectedCategory(selectedCategory === category.id ? '' : category.id)}
          >
            <div className="text-center">
              <div className="text-2xl mb-2">{category.emoji}</div>
              <div className="text-xs font-semibold text-gray-900">{category.label}</div>
            </div>
          </Button>
        ))}
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-200 rounded-xl h-20 animate-pulse"></div>
          ))}
        </div>
      ) : supplies.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🛍️</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No supplies found</h3>
          <p className="text-gray-500">
            {searchQuery 
              ? `No results for "${searchQuery}"` 
              : selectedCategory 
                ? `No ${selectedCategory} supplies available`
                : 'No supplies are currently available'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {supplies.map((supply) => (
            <SupplyCard key={supply.id} supply={supply} />
          ))}
        </div>
      )}

      <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}

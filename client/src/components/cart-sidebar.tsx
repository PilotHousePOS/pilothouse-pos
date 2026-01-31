import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Minus, Plus, Trash2, ShoppingCart, X } from "lucide-react";

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartSidebar({ isOpen, onClose }: CartSidebarProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [outOfStockPreference, setOutOfStockPreference] = useState("contact_me");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState("monthly");

  const { data: cartItems = [], isLoading } = useQuery({
    queryKey: ["/api/cart"],
    enabled: isOpen,
  });

  // Get supply IDs from cart to fetch only what we need
  const supplyIds = cartItems.filter((item: any) => item.supplyId).map((item: any) => item.supplyId);
  
  const { data: suppliesData } = useQuery({
    queryKey: ["/api/supplies", { ids: supplyIds.join(',') }],
    queryFn: async () => {
      if (supplyIds.length === 0) return { items: [] };
      const res = await fetch(`/api/supplies?ids=${supplyIds.join(',')}`);
      return res.json();
    },
    enabled: isOpen && supplyIds.length > 0,
  });
  const supplies = suppliesData?.items || [];

  const { data: petsData } = useQuery({
    queryKey: ["/api/pets"],
    enabled: isOpen && cartItems.length > 0,
  });
  const pets = petsData?.pets || [];

  // Fetch tax rate from public endpoint
  const { data: taxData } = useQuery<{ taxRate: number }>({
    queryKey: ["/api/settings/tax-rate"],
    enabled: isOpen,
  });
  const taxRate = taxData?.taxRate || 0;

  const updateQuantityMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: number; quantity: number }) => {
      await apiRequest("PUT", `/api/cart/${id}`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update quantity.",
        variant: "destructive",
      });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cart/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Item Removed",
        description: "Item has been removed from your cart.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to remove item.",
        variant: "destructive",
      });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      await apiRequest("POST", "/api/orders", orderData);
    },
    onSuccess: () => {
      toast({
        title: "Order Placed!",
        description: "Your order has been placed successfully.",
      });
      setIsCheckoutOpen(false);
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Order Failed",
        description: "Failed to place order. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Get item details with fallback for missing data
  const getItemDetails = (item: any) => {
    if (item.supplyId) {
      const supply = supplies.find(s => s.id === item.supplyId);
      return {
        name: supply?.name || "Unknown Supply",
        price: supply?.price || "0",
        image: supply?.imageUrl || "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
        type: "supply"
      };
    } else if (item.petId) {
      const pet = pets.find(p => p.id === item.petId);
      return {
        name: pet?.name || "Unknown Pet",
        price: pet?.price || "0",
        image: pet?.imageUrl || "https://images.unsplash.com/photo-1552053831-71594a27632d?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
        type: "pet",
        breed: pet?.breed
      };
    }
    return {
      name: "Unknown Item",
      price: "0",
      image: "",
      type: "unknown"
    };
  };

  const cartItemsWithDetails = cartItems.map(item => ({
    ...item,
    details: getItemDetails(item)
  }));

  const subtotal = cartItemsWithDetails.reduce((total, item) => {
    return total + (parseFloat(item.details.price) * item.quantity);
  }, 0);
  
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Add items to cart before checkout.",
        variant: "destructive",
      });
      return;
    }
    setIsCheckoutOpen(true);
  };

  const handlePlaceOrder = () => {
    const orderItems = cartItemsWithDetails.map(item => ({
      supplyId: item.supplyId || undefined,
      petId: item.petId || undefined,
      quantity: item.quantity,
      price: item.details.price,
    }));

    // Calculate next recurring date if recurring order
    let nextRecurringDate = null;
    if (isRecurring) {
      const now = new Date();
      switch (recurringFrequency) {
        case 'weekly':
          nextRecurringDate = new Date(now.setDate(now.getDate() + 7));
          break;
        case 'biweekly':
          nextRecurringDate = new Date(now.setDate(now.getDate() + 14));
          break;
        case 'monthly':
        default:
          nextRecurringDate = new Date(now.setMonth(now.getMonth() + 1));
          break;
      }
    }

    createOrderMutation.mutate({
      orderData: {
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        shippingAddress: "In-Store Pickup - Animal House Pet Store",
        outOfStockPreference,
        isRecurring,
        recurringFrequency: isRecurring ? recurringFrequency : null,
        nextRecurringDate: nextRecurringDate?.toISOString() || null,
      },
      items: orderItems,
    });
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full max-w-md p-0">
          <SheetHeader className="p-6 pb-4">
            <SheetTitle className="flex items-center space-x-2">
              <ShoppingCart className="w-5 h-5" />
              <span>Shopping Cart</span>
            </SheetTitle>
            <SheetDescription>
              {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'} in your cart
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6">
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-gray-200 rounded-xl h-20 animate-pulse"></div>
                ))}
              </div>
            ) : cartItems.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Your cart is empty</h3>
                <p className="text-gray-500 mb-4">Add some items to get started!</p>
                <Button onClick={onClose} className="bg-brand-blue hover:bg-blue-600">
                  Continue Shopping
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {cartItemsWithDetails.map((item) => (
                  <Card key={item.id} className="shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex space-x-3">
                        <img 
                          src={item.details.image}
                          alt={item.details.name}
                          className="w-16 h-16 object-cover rounded-lg" 
                        />
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm text-gray-900">{item.details.name}</h4>
                          {item.details.breed && (
                            <p className="text-xs text-gray-500">{item.details.breed}</p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-sm font-bold text-brand-red">${item.details.price}</p>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-8 h-8 p-0"
                                onClick={() => updateQuantityMutation.mutate({ 
                                  id: item.id, 
                                  quantity: Math.max(1, item.quantity - 1) 
                                })}
                                disabled={updateQuantityMutation.isPending}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-8 h-8 p-0"
                                onClick={() => updateQuantityMutation.mutate({ 
                                  id: item.id, 
                                  quantity: item.quantity + 1 
                                })}
                                disabled={updateQuantityMutation.isPending}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-8 h-8 p-0 text-red-500 hover:text-red-700"
                                onClick={() => removeItemMutation.mutate(item.id)}
                                disabled={removeItemMutation.isPending}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {cartItems.length > 0 && (
            <div className="border-t p-6 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Tax ({taxRate}%):</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold">Total:</span>
                  <span className="text-lg font-bold text-brand-red">${totalAmount.toFixed(2)}</span>
                </div>
              </div>
              <Button 
                onClick={handleCheckout}
                className="w-full bg-brand-red hover:bg-red-600 text-white py-3"
                disabled={createOrderMutation.isPending}
              >
                Proceed to Checkout
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Checkout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Order Summary</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {cartItemsWithDetails.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.details.name} x{item.quantity}</span>
                    <span>${(parseFloat(item.details.price) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <Separator className="my-2" />
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Tax ({taxRate}%):</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span>Total:</span>
                  <span className="text-brand-red">${totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                If an item is out of stock:
              </label>
              <div className="space-y-2">
                <label className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="outOfStock"
                    value="contact_me"
                    checked={outOfStockPreference === "contact_me"}
                    onChange={(e) => setOutOfStockPreference(e.target.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-medium">Contact me</span>
                    <p className="text-sm text-gray-600">We'll call you to discuss alternatives</p>
                  </div>
                </label>
                <label className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="outOfStock"
                    value="substitute"
                    checked={outOfStockPreference === "substitute"}
                    onChange={(e) => setOutOfStockPreference(e.target.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-medium">Replace with closest substitute</span>
                    <p className="text-sm text-gray-600">We'll pick a similar product for you</p>
                  </div>
                </label>
                <label className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="outOfStock"
                    value="no_replace"
                    checked={outOfStockPreference === "no_replace"}
                    onChange={(e) => setOutOfStockPreference(e.target.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-medium">Don't replace</span>
                    <p className="text-sm text-gray-600">Just remove the item from my order</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Recurring Purchase Option */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Make this a recurring order?
              </label>
              <div className="space-y-3">
                <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="w-4 h-4 text-brand-red"
                  />
                  <div>
                    <span className="font-medium">Yes, set up recurring order</span>
                    <p className="text-sm text-gray-600">We'll remind you when it's time to reorder</p>
                  </div>
                </label>
                
                {isRecurring && (
                  <div className="ml-7 space-y-2">
                    <p className="text-sm font-medium">How often?</p>
                    <div className="grid grid-cols-3 gap-2">
                      <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer text-sm ${recurringFrequency === 'weekly' ? 'border-brand-red bg-red-50' : 'hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="frequency"
                          value="weekly"
                          checked={recurringFrequency === "weekly"}
                          onChange={(e) => setRecurringFrequency(e.target.value)}
                          className="sr-only"
                        />
                        <span>Weekly</span>
                      </label>
                      <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer text-sm ${recurringFrequency === 'biweekly' ? 'border-brand-red bg-red-50' : 'hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="frequency"
                          value="biweekly"
                          checked={recurringFrequency === "biweekly"}
                          onChange={(e) => setRecurringFrequency(e.target.value)}
                          className="sr-only"
                        />
                        <span>Biweekly</span>
                      </label>
                      <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer text-sm ${recurringFrequency === 'monthly' ? 'border-brand-red bg-red-50' : 'hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="frequency"
                          value="monthly"
                          checked={recurringFrequency === "monthly"}
                          onChange={(e) => setRecurringFrequency(e.target.value)}
                          className="sr-only"
                        />
                        <span>Monthly</span>
                      </label>
                    </div>
                    <p className="text-xs text-gray-500">
                      We'll send you a reminder when it's time to place your next order.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Pickup Method
              </label>
              <div className="p-3 border rounded-lg bg-gray-50">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-brand-red rounded-full"></div>
                  <span className="font-medium">In-Store Pickup</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Available for pickup at Animal House Pet Store
                </p>
              </div>
            </div>

            <div className="flex space-x-3">
              <Button 
                variant="outline" 
                onClick={() => setIsCheckoutOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={handlePlaceOrder}
                disabled={createOrderMutation.isPending}
                className="flex-1 bg-brand-red hover:bg-red-600"
              >
                {createOrderMutation.isPending ? "Placing..." : "Place Order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

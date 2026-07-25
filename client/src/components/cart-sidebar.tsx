import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveTenantSlug } from "@/lib/queryClient";
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
import { Minus, Plus, Trash2, ShoppingCart, X, Gift, Star, CreditCard, AlertCircle, Settings, Award } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";

interface AstroReward {
  rewardId: string;
  programId?: string;
  programTitle: string;
  manufacturer?: string;
  itemDescription?: string;
  freeQty?: number;
  programImage?: string;
  type?: string;
  rebateAmount?: number;
}

interface AstroDeal {
  programId: string;
  programTitle: string;
  manufacturer: string;
  description: string;
  imageUrl: string;
  dealType: 'dollar_off' | 'bogo' | 'free_with_purchase' | 'buy_x_get_y' | 'unknown';
  discountAmount?: number;
  buyQty?: number;
  freeQty?: number;
  matchingCartItems: Array<{
    supplyId: number;
    supplyName: string;
    sku: string;
    price: number;
    quantity: number;
  }>;
  calculatedDiscount: number;
  autoApply: boolean;
}

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartSidebar({ isOpen, onClose }: CartSidebarProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [outOfStockPreference, setOutOfStockPreference] = useState("contact_me");
  const [customerNotes, setCustomerNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState("monthly");
  const [applyLoyaltyCredits, setApplyLoyaltyCredits] = useState(false);
  const [appliedRewards, setAppliedRewards] = useState<Record<number, AstroReward>>({});

  const { data: cartItems = [], isLoading } = useQuery({
    queryKey: ["/api/cart"],
    enabled: isOpen,
  });

  // Fetch current user profile to detect charge account status
  const { data: currentUser } = useQuery<{ isChargeAccount?: boolean; firstName?: string }>({
    queryKey: ["/api/auth/user"],
    enabled: isOpen,
  });
  const isChargeAccount = currentUser?.isChargeAccount === true;

  // Get supply IDs from cart to fetch only what we need
  const supplyIds = cartItems.filter((item: any) => item.supplyId).map((item: any) => item.supplyId);
  
  const { data: suppliesData } = useQuery({
    queryKey: ["/api/supplies", { ids: supplyIds.join(',') }],
    queryFn: async () => {
      if (supplyIds.length === 0) return { items: [] };
      const slug = getActiveTenantSlug();
      const res = await fetch(`/api/supplies?ids=${supplyIds.join(',')}`, {
        headers: slug ? { 'X-Tenant-Slug': slug } : {},
      });
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

  // Fetch user's loyalty credits
  const { data: loyaltyData } = useQuery<{
    loyaltyCredits: string;
    totalSpent: string;
  }>({
    queryKey: ["/api/user/loyalty"],
    enabled: isOpen,
  });
  const availableLoyaltyCredits = parseFloat(loyaltyData?.loyaltyCredits || "0");

  // Detect if any cart items are dog/cat food (earn only 25% loyalty)
  const FOOD_LOYALTY_CATEGORIES = ['dogFood', 'catFood'];
  const hasFoodItems = cartItems.some((item: any) => {
    if (!item.supplyId) return false;
    const supply = supplies.find((s: any) => s.id === item.supplyId);
    return supply && FOOD_LOYALTY_CATEGORIES.includes(supply.category || '');
  });

  // Categories ineligible for loyalty credit redemption
  const LOYALTY_INELIGIBLE_CATEGORIES = ['dogFood', 'catFood', 'dogCages', 'aquatics', 'reptiles', 'reptile'];
  const hasIneligibleLoyaltyItems = cartItems.some((item: any) => {
    if (!item.supplyId) return false;
    const supply = supplies.find((s: any) => s.id === item.supplyId);
    return supply && LOYALTY_INELIGIBLE_CATEGORIES.includes(supply.category || '');
  });

  // Fetch Astro loyalty rewards (ready to redeem)
  const { data: astroRewardsData } = useQuery<{ rewards: AstroReward[] }>({
    queryKey: ["/api/astro/cart-rewards"],
    enabled: isOpen && cartItems.length > 0,
  });
  const availableRewards = astroRewardsData?.rewards || [];

  const { data: astroDealsData } = useQuery<{ deals: AstroDeal[]; totalDiscount: number }>({
    queryKey: ["/api/astro/cart-deals"],
    enabled: isOpen && cartItems.length > 0,
  });
  const activeDeals = astroDealsData?.deals || [];
  const autoAppliedDeals = activeDeals.filter(d => d.autoApply && d.calculatedDiscount > 0);
  const dealDiscount = Math.round(
    autoAppliedDeals.reduce((sum, d) => sum + d.calculatedDiscount, 0) * 100
  ) / 100;

  // Fetch saved payment methods
  const { data: paymentMethodsData } = useQuery<{
    paymentMethods: Array<{
      id: string;
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
    }>;
    defaultPaymentMethod: string | null;
  }>({
    queryKey: ["/api/stripe/payment-methods"],
    enabled: isOpen,
  });
  const hasPaymentMethod = (paymentMethodsData?.paymentMethods?.length || 0) > 0;
  const defaultCard = paymentMethodsData?.paymentMethods?.find(
    pm => pm.id === paymentMethodsData?.defaultPaymentMethod
  ) || paymentMethodsData?.paymentMethods?.[0];

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
      const res = await apiRequest("POST", "/api/orders", orderData);
      return res.json();
    },
    onSuccess: (data) => {
      setIsCheckoutOpen(false);
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      window.location.href = "/order-confirmation/" + data.id;
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

  // Calculate Astro reward discount (free items)
  const astroDiscount = Math.round(Object.entries(appliedRewards).reduce((total, [cartItemId, reward]) => {
    const item = cartItemsWithDetails.find(i => i.id === parseInt(cartItemId));
    if (item) {
      return total + parseFloat(item.details.price) * Math.min(reward.freeQty || 1, item.quantity);
    }
    return total;
  }, 0) * 100) / 100;

  const subtotal = Math.round(cartItemsWithDetails.reduce((total, item) => {
    return total + (parseFloat(item.details.price) * item.quantity);
  }, 0) * 100) / 100;
  
  const totalAstroSavings = Math.round((astroDiscount + dealDiscount) * 100) / 100;
  const subtotalAfterRewards = Math.round(Math.max(0, subtotal - totalAstroSavings) * 100) / 100;
  const taxAmount = Math.round(subtotalAfterRewards * (taxRate / 100) * 100) / 100;
  const subtotalWithTax = Math.round((subtotalAfterRewards + taxAmount) * 100) / 100;
  
  // Loyalty credits only apply to eligible items (not dog/cat food, cages, tanks/enclosures, or grooming)
  const loyaltyEligibleSubtotal = Math.round(cartItemsWithDetails.reduce((total, item) => {
    if (!item.supplyId) return total + (parseFloat(item.details.price) * item.quantity);
    const supply = supplies.find((s: any) => s.id === item.supplyId);
    if (supply && LOYALTY_INELIGIBLE_CATEGORIES.includes(supply.category || '')) return total;
    return total + (parseFloat(item.details.price) * item.quantity);
  }, 0) * 100) / 100;
  const loyaltyEligibleWithTax = Math.round(Math.min(loyaltyEligibleSubtotal * (1 + taxRate / 100), subtotalWithTax) * 100) / 100;
  const loyaltyDiscount = applyLoyaltyCredits ? Math.round(Math.min(availableLoyaltyCredits, loyaltyEligibleWithTax) * 100) / 100 : 0;
  const amountBeforeFee = Math.round((subtotalWithTax - loyaltyDiscount) * 100) / 100;
  
  const convenienceFee = 0;
  const totalAmount = Math.round(amountBeforeFee * 100) / 100;

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

    const astroRewardInfo = Object.keys(appliedRewards).length > 0 || autoAppliedDeals.length > 0 ? {
      appliedRewards: Object.entries(appliedRewards).map(([cartItemId, reward]) => ({
        cartItemId: parseInt(cartItemId),
        rewardId: reward.rewardId,
        programId: reward.programId,
        programTitle: reward.programTitle,
      })),
      appliedDeals: autoAppliedDeals.map(d => ({
        programId: d.programId,
        programTitle: d.programTitle,
        dealType: d.dealType,
        discount: d.calculatedDiscount.toFixed(2),
        matchingItems: d.matchingCartItems.map(i => i.supplyName),
      })),
      astroDiscount: astroDiscount.toFixed(2),
      dealDiscount: dealDiscount.toFixed(2),
    } : undefined;

    const totalAstroDiscountForOrder = Math.round((astroDiscount + dealDiscount) * 100) / 100;

    createOrderMutation.mutate({
      orderData: {
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        loyaltyCreditsApplied: loyaltyDiscount.toFixed(2),
        convenienceFee: convenienceFee.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        astroRewardDiscount: totalAstroDiscountForOrder > 0 ? totalAstroDiscountForOrder.toFixed(2) : "0.00",
        astroRewardInfo: astroRewardInfo ? JSON.stringify(astroRewardInfo) : null,
        shippingAddress: "In-Store Pickup - PilotHouse",
        outOfStockPreference,
        customerNotes: customerNotes.trim() || null,
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
                          {appliedRewards[item.id] && (
                          <div className="flex items-center gap-1 mt-1">
                            <Award className="w-3 h-3 text-green-600" />
                            <span className="text-xs font-semibold text-green-600">FREE - Astro Reward Applied</span>
                            <button
                              onClick={() => {
                                const updated = { ...appliedRewards };
                                delete updated[item.id];
                                setAppliedRewards(updated);
                              }}
                              className="text-xs text-gray-400 hover:text-red-500 ml-1"
                            >
                              (remove)
                            </button>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                            <p className={`text-sm font-bold ${appliedRewards[item.id] ? 'line-through text-gray-400' : 'text-brand-red'}`}>${item.details.price}</p>
                            {appliedRewards[item.id] && (
                              <span className="text-sm font-bold text-green-600 ml-1">$0.00</span>
                            )}
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
              {/* Astro Deals Auto-Applied */}
              {autoAppliedDeals.length > 0 && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Gift className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-orange-800 dark:text-orange-200">
                        {autoAppliedDeals.length} Deal{autoAppliedDeals.length > 1 ? 's' : ''} Applied!
                      </p>
                      <div className="mt-1 space-y-1.5">
                        {autoAppliedDeals.map(deal => (
                          <div key={deal.programId} className="text-xs">
                            <p className="font-medium text-orange-700 dark:text-orange-300 break-words">
                              {deal.programTitle}
                            </p>
                            <p className="text-orange-600 dark:text-orange-400">
                              Saving ${deal.calculatedDiscount.toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Informational deals (eligible but not auto-applied) */}
              {activeDeals.filter(d => !d.autoApply && d.matchingCartItems.length > 0).length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Gift className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-blue-800 dark:text-blue-200">
                        Eligible Deals
                      </p>
                      {activeDeals.filter(d => !d.autoApply && d.matchingCartItems.length > 0).map(deal => (
                        <p key={deal.programId} className="text-xs text-blue-700 dark:text-blue-300 mt-1 break-words">
                          {deal.programTitle}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Astro Reward Banner */}
              {!isChargeAccount && availableRewards.length > 0 && Object.keys(appliedRewards).length === 0 && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg overflow-hidden">
                  <div className="flex items-start gap-2">
                    <Award className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-green-800 dark:text-green-200">
                        You have {availableRewards.length} free bag reward{availableRewards.length > 1 ? 's' : ''} ready!
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-0.5 break-words">
                        {availableRewards[0].programTitle}
                      </p>
                      <div className="mt-2 space-y-1">
                        {cartItemsWithDetails.map(item => (
                          <Button
                            key={item.id}
                            variant="outline"
                            size="sm"
                            className="w-full text-xs h-auto py-1.5 border-green-300 text-green-700 hover:bg-green-100 whitespace-normal text-left"
                            onClick={() => {
                              setAppliedRewards(prev => ({
                                ...prev,
                                [item.id]: availableRewards[0]
                              }));
                              toast({
                                title: "Reward Applied!",
                                description: `Free bag reward applied to ${item.details.name}`,
                              });
                            }}
                          >
                            Apply to: {item.details.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Applied Reward Summary */}
              {!isChargeAccount && astroDiscount > 0 && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-semibold text-sm text-green-800 dark:text-green-200">
                        Astro Reward Applied!
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300">
                        Saving ${astroDiscount.toFixed(2)} with your free bag reward
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {astroDiscount > 0 && (
                  <div className="flex justify-between items-center text-sm text-green-600 font-medium">
                    <span>Astro Reward Discount:</span>
                    <span>-${astroDiscount.toFixed(2)}</span>
                  </div>
                )}
                {dealDiscount > 0 && (
                  <div className="flex justify-between items-center text-sm text-orange-600 font-medium">
                    <span>Astro Deal Savings:</span>
                    <span>-${dealDiscount.toFixed(2)}</span>
                  </div>
                )}
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
              <p className="text-xs text-gray-400 mt-3 text-center leading-relaxed">
                Disclaimer: Purchase transactions are only completed once your order is approved by management. No funds will be removed from your account until such time of the approval to ensure accuracy of your order.
              </p>
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
                    <span className={appliedRewards[item.id] ? 'text-green-600' : ''}>
                      {item.details.name} x{item.quantity}
                      {appliedRewards[item.id] && ' (FREE)'}
                    </span>
                    <span className={appliedRewards[item.id] ? 'line-through text-gray-400' : ''}>
                      ${(parseFloat(item.details.price) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <Separator className="my-2" />
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {astroDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-600 font-medium">
                    <span>Astro Reward Discount:</span>
                    <span>-${astroDiscount.toFixed(2)}</span>
                  </div>
                )}
                {dealDiscount > 0 && (
                  <div className="flex justify-between text-sm text-orange-600 font-medium">
                    <span>Astro Deal Savings:</span>
                    <span>-${dealDiscount.toFixed(2)}</span>
                  </div>
                )}
                {taxRate > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Tax ({taxRate}%):</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                )}
                {loyaltyDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Loyalty Credit:</span>
                    <span>-${loyaltyDiscount.toFixed(2)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold">
                  <span>Total:</span>
                  <span className="text-brand-red">${totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Loyalty Credits Section */}
            {!isChargeAccount && availableLoyaltyCredits > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gift className="w-5 h-5 text-amber-500" />
                    <div>
                      <span className="font-medium text-sm">Use Loyalty Credits</span>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Available: <span className="font-bold text-amber-600">${availableLoyaltyCredits.toFixed(2)}</span>
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={applyLoyaltyCredits}
                    onCheckedChange={setApplyLoyaltyCredits}
                  />
                </div>
                {applyLoyaltyCredits && loyaltyDiscount > 0 && (
                  <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    Saving ${loyaltyDiscount.toFixed(2)} on eligible items!
                  </div>
                )}
                {hasIneligibleLoyaltyItems && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    Not applicable to: dog food, cat food, cages, tanks, or enclosures.
                  </p>
                )}
                {applyLoyaltyCredits && loyaltyEligibleWithTax === 0 && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    No eligible items in cart for loyalty redemption.
                  </p>
                )}
              </div>
            )}

            {/* Food Loyalty Disclaimer */}
            {!isChargeAccount && hasFoodItems && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <span className="font-semibold">Loyalty Note:</span> Dog &amp; cat food purchases earn loyalty credit at 25% of their value due to the low margins on food products. All other items earn at the full rate.
                </p>
              </div>
            )}

            {/* Payment Method Info */}
            {isChargeAccount ? (
              <div className="p-3 border rounded-lg border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20">
                <div className="flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm text-orange-800 dark:text-orange-200">Charge Account</p>
                    <p className="text-xs text-orange-700 dark:text-orange-300">
                      This order will be charged to your account and paid in-store. No card will be charged.
                    </p>
                  </div>
                </div>
              </div>
            ) : totalAmount <= 0 ? (
              <div className="p-3 border rounded-lg border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                <div className="flex items-start gap-3">
                  <Award className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm text-green-800 dark:text-green-200">No payment needed</p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      Your rewards cover this order completely!
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`p-3 border rounded-lg ${hasPaymentMethod ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'}`}>
                <div className="flex items-start gap-3">
                  {hasPaymentMethod ? (
                    <CreditCard className="w-5 h-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
                  )}
                  <div className="flex-1">
                    {hasPaymentMethod ? (
                      <>
                        <p className="font-medium text-sm text-green-800 dark:text-green-200">Payment on file</p>
                        <p className="text-xs text-green-700 dark:text-green-300">
                          Your {defaultCard?.brand} ending in {defaultCard?.last4} will be charged automatically when your order is approved.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-sm text-amber-800 dark:text-amber-200">No payment method saved</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          You'll need to provide payment when your order is approved.
                        </p>
                        <Link href="/settings" onClick={() => setIsCheckoutOpen(false)}>
                          <Button variant="link" size="sm" className="h-auto p-0 mt-1 text-amber-700">
                            <Settings className="w-3 h-3 mr-1" />
                            Add payment method
                          </Button>
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

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

            {/* Order Notes / Special Requests */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Order Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">Substitution requests, allergy info, special instructions, etc.</p>
              <textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="e.g. If salmon flavor is out, please substitute chicken. Avoid grain-free options."
                rows={3}
                maxLength={500}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
              {customerNotes.length > 0 && (
                <p className="text-xs text-gray-400 text-right">{customerNotes.length}/500</p>
              )}
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
                  Available for pickup at PilotHouse
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
              <p className="font-semibold mb-0.5">Order Processing Hours</p>
              <p>Orders are reviewed and approved between <span className="font-medium">10:00 AM – 5:00 PM</span>. Orders placed outside these hours will be processed the next business day. For immediate assistance, please call us at <span className="font-medium whitespace-nowrap">(318) 323-6090</span>.</p>
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

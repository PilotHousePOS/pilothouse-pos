import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { CheckCircle, Package, ArrowLeft, ShoppingBag, Home, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { safeGoBack } from "@/lib/navigation";
import OrderStatusTimeline from "@/components/order-status-timeline";

export default function OrderConfirmation() {
  const [, setLocation] = useLocation();
  const { orderId } = useParams<{ orderId: string }>();

  const { data: order, isLoading } = useQuery({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order");
      return res.json();
    },
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="w-full min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="w-full min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Package className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Order Not Found</h2>
        <p className="text-gray-500 mb-4">We couldn't find this order.</p>
        <Button onClick={() => setLocation("/supplies")} className="bg-brand-blue hover:bg-blue-600">
          Continue Shopping
        </Button>
      </div>
    );
  }

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const orderData = order.order || order;
  const items = order.items || [];
  const subtotal = orderData.subtotal || "0.00";
  const taxAmount = orderData.taxAmount || "0.00";
  const loyaltyCreditsApplied = orderData.loyaltyCreditsApplied || "0.00";
  const discountAmount = orderData.discountAmount || "0.00";
  const discountReason = orderData.discountReason || "Discount";
  const convenienceFee = orderData.convenienceFee || "0.00";
  const totalAmount = orderData.totalAmount || "0.00";

  return (
    <div className="w-full min-h-screen bg-gray-50 pb-24">
      <div className="fixed top-4 right-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          className="bg-white shadow-lg hover:bg-gray-100 rounded-full"
        >
          <X className="w-6 h-6" />
        </Button>
      </div>

      <div className="p-4 pt-16">
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-4">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 text-center">Order Confirmed!</h1>
          <p className="text-gray-500 mt-1 text-center">Thank you for your purchase</p>
        </div>

        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">Order Number</p>
                <p className="font-semibold">#{orderData.id}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Date</p>
                <p className="font-semibold text-sm">{formatDate(orderData.orderDate || new Date())}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <Badge className="bg-green-500">
                  {(orderData.status || "pending").charAt(0).toUpperCase() + (orderData.status || "pending").slice(1)}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pickup Method</p>
                <p className="font-semibold text-sm">In-Store Pickup</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <OrderStatusTimeline status={orderData.status || "pending"} />
            </div>
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Order Items
              </h3>
              <div className="space-y-3">
                {items.map((item: any, index: number) => (
                  <div key={item.id || index}>
                    <div className="flex items-center gap-3">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.itemName || "Item"}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.itemName || item.supplyName || item.petName || "Item"}
                        </p>
                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-semibold text-sm">${parseFloat(item.price).toFixed(2)}</p>
                    </div>
                    {index < items.length - 1 && <Separator className="mt-3" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardContent className="p-4 space-y-2">
            <h3 className="font-semibold mb-2">Order Summary</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span>${parseFloat(subtotal).toFixed(2)}</span>
            </div>
            {parseFloat(taxAmount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span>${parseFloat(taxAmount).toFixed(2)}</span>
              </div>
            )}
            {parseFloat(loyaltyCreditsApplied) > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Loyalty Credits Applied</span>
                <span>-${parseFloat(loyaltyCreditsApplied).toFixed(2)}</span>
              </div>
            )}
            {parseFloat(discountAmount) > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>{discountReason}</span>
                <span>-${parseFloat(discountAmount).toFixed(2)}</span>
              </div>
            )}
            {parseFloat(convenienceFee) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Convenience Fee</span>
                <span>${parseFloat(convenienceFee).toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span className="text-brand-green">${parseFloat(totalAmount).toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button
            onClick={() => setLocation("/supplies")}
            className="w-full bg-brand-blue hover:bg-blue-600 text-white py-3"
          >
            <ShoppingBag className="w-4 h-4 mr-2" />
            Continue Shopping
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation("/orders")}
            className="w-full py-3"
          >
            <Package className="w-4 h-4 mr-2" />
            View Order History
          </Button>
        </div>
      </div>
    </div>
  );
}

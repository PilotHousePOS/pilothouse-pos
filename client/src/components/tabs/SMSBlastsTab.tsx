import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Send, MessageSquare } from "lucide-react";

interface Props { typedUser: any }

const SEGMENTS = [
  { value: "all", label: "All Users & Contacts" },
  { value: "contacts", label: "Contacts Only" },
  { value: "loyalty", label: "Loyalty Members" },
];

export default function SMSBlastsTab({ typedUser }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);

  const { data: blasts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/sms-blasts"],
    enabled: !!typedUser?.isAdmin,
  });

  // Fetch preview count when segment changes
  const { data: preview } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/sms-blasts/preview-count", segment],
    queryFn: () => apiRequest("GET", `/api/admin/sms-blasts/preview-count?segment=${segment}`).then(r => r.json()),
    enabled: !!typedUser?.isAdmin,
  });

  useEffect(() => { if (preview) setRecipientCount(preview.count); }, [preview]);

  const sendMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/sms-blasts", { message, segment }),
    onSuccess: async (res: Response) => {
      const data = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/admin/sms-blasts"] });
      setConfirmOpen(false);
      setMessage("");
      toast({ title: `Blast sent to ${data.sent} of ${data.total} recipients` });
    },
    onError: () => { setConfirmOpen(false); toast({ title: "Failed to send", variant: "destructive" }); },
  });

  const charLeft = 160 - message.length;
  const segParts = Math.ceil(message.length / 160) || 1;
  const segmentLabel = SEGMENTS.find(s => s.value === segment)?.label || segment;

  return (
    <div className="space-y-5">
      {/* Compose Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-4 h-4" />Compose Blast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="mt-1 h-28 resize-none"
              placeholder="Type your SMS message here…"
              maxLength={800}
            />
            <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
              <span>{charLeft < 0 ? <span className="text-red-500">{Math.abs(charLeft)} over 160</span> : `${charLeft} chars left`}{segParts > 1 && <span className="ml-2 text-yellow-600">({segParts} SMS segments)</span>}</span>
            </div>
          </div>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label>Audience</Label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{SEGMENTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {recipientCount !== null && (
              <div className="flex-shrink-0 mb-1">
                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-3 py-1.5 rounded-full font-medium border border-blue-200">
                  ~{recipientCount} recipients
                </span>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!message.trim() || sendMutation.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              <Send className="w-4 h-4 mr-2" />Send Blast
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Sent History</h3>
        {isLoading ? <p className="text-sm text-gray-500">Loading…</p> :
         blasts.length === 0 ? <p className="text-sm text-gray-400 italic">No blasts sent yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-xs text-gray-500 text-left">
                <th className="pb-2 font-medium">Date</th><th className="pb-2 font-medium">Segment</th>
                <th className="pb-2 font-medium">Message</th><th className="pb-2 font-medium">Sent</th>
                <th className="pb-2 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {blasts.map((b: any) => (
                  <tr key={b.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">{new Date(b.sentAt).toLocaleString()}</td>
                    <td className="py-2 pr-3 text-xs capitalize">{b.segment}</td>
                    <td className="py-2 pr-3 max-w-[240px] truncate text-xs text-gray-700">{b.message}</td>
                    <td className="py-2 pr-3 text-xs font-medium">{b.recipientCount}</td>
                    <td className="py-2">
                      <Badge className={b.status === "sent" ? "bg-green-100 text-green-700 text-xs" : "bg-red-100 text-red-700 text-xs"}>{b.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm SMS Blast</DialogTitle>
            <DialogDescription>
              You're about to send an SMS to <strong>~{recipientCount ?? "?"} recipients</strong> in the "{segmentLabel}" segment. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 italic">"{message}"</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 text-white" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
              {sendMutation.isPending ? "Sending…" : "Send Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

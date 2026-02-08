import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus,
  Edit,
  Trash2,
  Mail,
  Phone,
  Clock,
  FileText,
  Send,
  RotateCcw,
  Download,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search
} from "lucide-react";

interface EmailCenterProps {
  groomingSettings: any[];
}

export default function EmailCenter({ groomingSettings }: EmailCenterProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'email' | 'sms' | 'automated' | 'daily-reports' | 'sms-management'>('email');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sendToAll, setSendToAll] = useState(true);
  const [roleFilters, setRoleFilters] = useState<Set<string>>(new Set(['customers', 'groomers', 'admins']));
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMarketing, setIsMarketing] = useState(false);
  
  const [showAutoMessageForm, setShowAutoMessageForm] = useState(false);
  const [editingAutoMessage, setEditingAutoMessage] = useState<any>(null);
  const [autoMessageForm, setAutoMessageForm] = useState({
    name: '',
    triggerType: 'appointment_reminder' as string,
    triggerValue: '24',
    targetAudience: 'appointment_customers' as string,
    channel: 'email' as string,
    emailSubject: '',
    emailBody: '',
    smsBody: '',
    isActive: true
  });

  const [dailyReportSettings, setDailyReportSettings] = useState({
    enabled: false,
    emails: '',
    time: '21:00'
  });
  const [isSavingDailyReport, setIsSavingDailyReport] = useState(false);

  // SMS Management state
  const [smsContactSearch, setSmsContactSearch] = useState('');
  const [smsLogFilter, setSmsLogFilter] = useState<'all' | 'failed' | 'skipped'>('all');

  const { data: automatedMessages = [], isLoading: loadingAutoMessages } = useQuery<any[]>({
    queryKey: ['/api/admin/automated-messages'],
  });

  const { data: allContacts = [], isLoading: loadingContacts } = useQuery<any[]>({
    queryKey: ['/api/contacts'],
    enabled: activeTab === 'sms-management',
  });

  const { data: smsLogs = [], isLoading: loadingSmsLogs } = useQuery<any[]>({
    queryKey: ['/api/admin/sms-logs'],
    enabled: activeTab === 'sms-management',
  });

  const { data: dailyReportData, isLoading: loadingDailyReport } = useQuery<any>({
    queryKey: ['/api/admin/daily-report-settings'],
  });

  useEffect(() => {
    if (dailyReportData) {
      setDailyReportSettings({
        enabled: dailyReportData.enabled || false,
        emails: dailyReportData.emails || '',
        time: dailyReportData.time || '21:00'
      });
    }
  }, [dailyReportData]);

  const { data: recipients = [], isLoading: loadingRecipients } = useQuery<any[]>({
    queryKey: ['/api/admin/email/recipients'],
  });

  const allRolesSelected = roleFilters.size === 3 && roleFilters.has('customers') && roleFilters.has('groomers') && roleFilters.has('admins');

  const filteredRecipients = (recipients as any[]).filter((r: any) => {
    const matchesSearch = r.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.phoneNumber && r.phoneNumber.includes(searchTerm));
    
    if (!matchesSearch) return false;
    
    if (allRolesSelected || roleFilters.size === 0) return true;
    
    if (roleFilters.has('customers') && !r.isAdmin && !r.isGroomer) return true;
    if (roleFilters.has('groomers') && r.isGroomer) return true;
    if (roleFilters.has('admins') && r.isAdmin) return true;
    return false;
  });

  const recipientsWithPhones = filteredRecipients.filter((r: any) => r.phoneNumber);

  const handleSendEmail = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both subject and message",
        variant: "destructive"
      });
      return;
    }

    if (!sendToAll && selectedRecipients.length === 0) {
      toast({
        title: "No Recipients Selected",
        description: "Please select at least one recipient or choose 'Send to All'",
        variant: "destructive"
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch('/api/admin/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject,
          message,
          sendToAll,
          roleFilter: sendToAll ? (allRolesSelected ? 'all' : Array.from(roleFilters)) : undefined,
          recipients: sendToAll ? undefined : selectedRecipients,
          isMarketing
        })
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Emails Sent",
          description: result.message
        });
        setSubject('');
        setMessage('');
        setSelectedRecipients([]);
        setIsMarketing(false);
      } else {
        toast({
          title: "Failed to Send",
          description: result.message || "Something went wrong",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send emails. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendSMS = async () => {
    if (!message.trim()) {
      toast({
        title: "Missing Message",
        description: "Please enter a message to send",
        variant: "destructive"
      });
      return;
    }

    if (!sendToAll && selectedRecipients.length === 0) {
      toast({
        title: "No Recipients Selected",
        description: "Please select at least one recipient with a phone number",
        variant: "destructive"
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch('/api/admin/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message,
          sendToAll,
          roleFilter: sendToAll ? (allRolesSelected ? 'all' : Array.from(roleFilters)) : undefined,
          recipients: sendToAll ? undefined : selectedRecipients
        })
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Text Messages Sent",
          description: result.message
        });
        setMessage('');
        setSelectedRecipients([]);
      } else {
        toast({
          title: "Failed to Send",
          description: result.message || "Something went wrong",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send text messages. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  const toggleRecipient = (id: number | string) => {
    const idStr = String(id);
    setSelectedRecipients(prev =>
      prev.includes(idStr) ? prev.filter(r => r !== idStr) : [...prev, idStr]
    );
  };

  const selectAll = () => {
    const recipientsList = activeTab === 'sms' ? recipientsWithPhones : filteredRecipients;
    setSelectedRecipients(recipientsList.map((r: any) => String(r.id)));
  };

  const clearAll = () => {
    setSelectedRecipients([]);
  };

  const handleSaveDailyReportSettings = async () => {
    if (dailyReportSettings.enabled && !dailyReportSettings.emails.trim()) {
      toast({
        title: "Missing Email",
        description: "Please enter at least one email address for the daily report",
        variant: "destructive"
      });
      return;
    }

    setIsSavingDailyReport(true);
    try {
      const response = await fetch('/api/admin/daily-report-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dailyReportSettings)
      });

      if (response.ok) {
        toast({
          title: "Settings Saved",
          description: "Daily sales report settings have been updated"
        });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/daily-report-settings'] });
      } else {
        const result = await response.json();
        toast({
          title: "Failed to Save",
          description: result.message || "Something went wrong",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSavingDailyReport(false);
    }
  };

  const handleSendTestReport = async () => {
    if (!dailyReportSettings.emails.trim()) {
      toast({
        title: "Missing Email",
        description: "Please enter an email address first",
        variant: "destructive"
      });
      return;
    }

    setIsSavingDailyReport(true);
    try {
      const response = await fetch('/api/admin/daily-report-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ emails: dailyReportSettings.emails })
      });

      const result = await response.json();
      if (response.ok) {
        toast({
          title: "Test Report Sent",
          description: result.message || "Check your email for the test report"
        });
      } else {
        toast({
          title: "Failed to Send",
          description: result.message || "Something went wrong",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send test report. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSavingDailyReport(false);
    }
  };

  const resetAutoMessageForm = () => {
    setAutoMessageForm({
      name: '',
      triggerType: 'appointment_reminder',
      triggerValue: '24',
      targetAudience: 'appointment_customers',
      channel: 'email',
      emailSubject: '',
      emailBody: '',
      smsBody: '',
      isActive: true
    });
    setEditingAutoMessage(null);
    setShowAutoMessageForm(false);
  };

  const handleSaveAutoMessage = async () => {
    if (!autoMessageForm.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (autoMessageForm.channel === 'email' && (!autoMessageForm.emailSubject.trim() || !autoMessageForm.emailBody.trim())) {
      toast({ title: "Email subject and body required", variant: "destructive" });
      return;
    }
    if (autoMessageForm.channel === 'sms' && !autoMessageForm.smsBody.trim()) {
      toast({ title: "SMS body required", variant: "destructive" });
      return;
    }

    try {
      const url = editingAutoMessage
        ? `/api/admin/automated-messages/${editingAutoMessage.id}`
        : '/api/admin/automated-messages';
      const method = editingAutoMessage ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(autoMessageForm)
      });

      if (response.ok) {
        toast({ title: editingAutoMessage ? "Message updated" : "Message created" });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/automated-messages'] });
        resetAutoMessageForm();
      } else {
        const result = await response.json();
        toast({ title: result.message || "Failed to save", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error saving message", variant: "destructive" });
    }
  };

  const handleDeleteAutoMessage = async (id: number) => {
    if (!confirm('Delete this automated message?')) return;
    try {
      await fetch(`/api/admin/automated-messages/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/automated-messages'] });
      toast({ title: "Message deleted" });
    } catch (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleToggleAutoMessage = async (id: number, isActive: boolean) => {
    try {
      await fetch(`/api/admin/automated-messages/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive })
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/automated-messages'] });
    } catch (error) {
      toast({ title: "Failed to toggle", variant: "destructive" });
    }
  };

  const editAutoMessage = (msg: any) => {
    setAutoMessageForm({
      name: msg.name,
      triggerType: msg.triggerType,
      triggerValue: msg.triggerValue || '24',
      targetAudience: msg.targetAudience,
      channel: msg.channel,
      emailSubject: msg.emailSubject || '',
      emailBody: msg.emailBody || '',
      smsBody: msg.smsBody || '',
      isActive: msg.isActive
    });
    setEditingAutoMessage(msg);
    setShowAutoMessageForm(true);
  };

  const getTriggerLabel = (type: string, value: string) => {
    switch (type) {
      case 'appointment_reminder': return `${value} hours before appointment`;
      case 'daily': return `Daily at ${value}`;
      case 'weekly': return `Weekly on ${value}`;
      default: return type;
    }
  };

  const getAudienceLabel = (audience: string) => {
    const labels: Record<string, string> = {
      all: 'All Users',
      customers: 'Customers Only',
      groomers: 'Groomers Only',
      admins: 'Admins Only',
      appointment_customers: 'Appointment Customers'
    };
    return labels[audience] || audience;
  };

  const getRoleCount = (role: string) => {
    switch (role) {
      case 'customers':
        return (recipients as any[]).filter((r: any) => !r.isAdmin && !r.isGroomer).length;
      case 'groomers':
        return (recipients as any[]).filter((r: any) => r.isGroomer).length;
      case 'admins':
        return (recipients as any[]).filter((r: any) => r.isAdmin).length;
      default:
        return recipients.length;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Communication Center
          </CardTitle>
          <CardDescription>
            Send emails and text messages to customers, groomers, and admins
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-2 border-b pb-2 overflow-x-auto">
            <Button
              variant={activeTab === 'email' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setActiveTab('email'); setSelectedRecipients([]); }}
              className="flex-shrink-0"
            >
              <Mail className="w-4 h-4 mr-2" />
              Email
            </Button>
            <Button
              variant={activeTab === 'sms' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setActiveTab('sms'); setSelectedRecipients([]); }}
              className="flex-shrink-0"
            >
              <Phone className="w-4 h-4 mr-2" />
              Text Message
            </Button>
            <Button
              variant={activeTab === 'automated' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setActiveTab('automated'); setSelectedRecipients([]); }}
              className="flex-shrink-0"
            >
              <Clock className="w-4 h-4 mr-2" />
              Automated
            </Button>
            <Button
              variant={activeTab === 'daily-reports' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setActiveTab('daily-reports'); setSelectedRecipients([]); }}
              className="flex-shrink-0"
            >
              <FileText className="w-4 h-4 mr-2" />
              Daily Reports
            </Button>
            <Button
              variant={activeTab === 'sms-management' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setActiveTab('sms-management'); setSelectedRecipients([]); }}
              className="flex-shrink-0"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              SMS Settings
            </Button>
          </div>

          {activeTab === 'automated' && (
            <div className="space-y-4">
              {!showAutoMessageForm ? (
                <>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Create scheduled messages that send automatically based on triggers.
                    </p>
                    <Button onClick={() => setShowAutoMessageForm(true)} className="bg-brand-blue hover:bg-blue-600">
                      <Plus className="w-4 h-4 mr-2" /> New Message
                    </Button>
                  </div>

                  {loadingAutoMessages ? (
                    <div className="text-center py-8 text-muted-foreground">Loading...</div>
                  ) : (automatedMessages as any[]).length === 0 ? (
                    <div className="text-center py-8 border rounded-lg">
                      <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-muted-foreground">No automated messages yet</p>
                      <Button onClick={() => setShowAutoMessageForm(true)} variant="outline" className="mt-3">
                        <Plus className="w-4 h-4 mr-2" /> Create Your First
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(automatedMessages as any[]).map((msg: any) => (
                        <div key={msg.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{msg.name}</h4>
                                <Badge variant={msg.isActive ? 'default' : 'secondary'}>
                                  {msg.isActive ? 'Active' : 'Paused'}
                                </Badge>
                                <Badge variant="outline">{msg.channel.toUpperCase()}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {getTriggerLabel(msg.triggerType, msg.triggerValue)} • {getAudienceLabel(msg.targetAudience)}
                              </p>
                              {msg.channel === 'email' && (
                                <p className="text-sm mt-2 truncate">Subject: {msg.emailSubject}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={msg.isActive}
                                onCheckedChange={(checked) => handleToggleAutoMessage(msg.id, checked)}
                              />
                              <Button variant="ghost" size="sm" onClick={() => editAutoMessage(msg)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteAutoMessage(msg.id)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4 border rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">{editingAutoMessage ? 'Edit Message' : 'New Automated Message'}</h4>
                    <Button variant="ghost" size="sm" onClick={resetAutoMessageForm}>Cancel</Button>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={autoMessageForm.name}
                        onChange={(e) => setAutoMessageForm({ ...autoMessageForm, name: e.target.value })}
                        placeholder="e.g., Appointment Reminder"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Trigger</Label>
                        <Select
                          value={autoMessageForm.triggerType}
                          onValueChange={(v) => setAutoMessageForm({ ...autoMessageForm, triggerType: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="appointment_reminder">Before Appointment</SelectItem>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{autoMessageForm.triggerType === 'appointment_reminder' ? 'Hours Before' : 'Time/Day'}</Label>
                        <Input
                          value={autoMessageForm.triggerValue}
                          onChange={(e) => setAutoMessageForm({ ...autoMessageForm, triggerValue: e.target.value })}
                          placeholder={autoMessageForm.triggerType === 'appointment_reminder' ? '24' : '09:00'}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Channel</Label>
                        <Select
                          value={autoMessageForm.channel}
                          onValueChange={(v) => setAutoMessageForm({ ...autoMessageForm, channel: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="sms">SMS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Target Audience</Label>
                        <Select
                          value={autoMessageForm.targetAudience}
                          onValueChange={(v) => setAutoMessageForm({ ...autoMessageForm, targetAudience: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="appointment_customers">Appointment Customers</SelectItem>
                            <SelectItem value="all">All Users</SelectItem>
                            <SelectItem value="customers">Customers Only</SelectItem>
                            <SelectItem value="groomers">Groomers Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {autoMessageForm.channel === 'email' && (
                      <>
                        <div>
                          <Label>Subject</Label>
                          <Input
                            value={autoMessageForm.emailSubject}
                            onChange={(e) => setAutoMessageForm({ ...autoMessageForm, emailSubject: e.target.value })}
                            placeholder="Email subject"
                          />
                        </div>
                        <div>
                          <Label>Body</Label>
                          <Textarea
                            value={autoMessageForm.emailBody}
                            onChange={(e) => setAutoMessageForm({ ...autoMessageForm, emailBody: e.target.value })}
                            placeholder="Email body..."
                            rows={6}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Use placeholders: {'{{name}}'}, {'{{date}}'}, {'{{time}}'}, {'{{service}}'}
                          </p>
                        </div>
                      </>
                    )}

                    {autoMessageForm.channel === 'sms' && (
                      <div>
                        <Label>Message</Label>
                        <Textarea
                          value={autoMessageForm.smsBody}
                          onChange={(e) => setAutoMessageForm({ ...autoMessageForm, smsBody: e.target.value })}
                          placeholder="SMS message..."
                          rows={4}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Use placeholders: {'{{name}}'}, {'{{date}}'}, {'{{time}}'}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={autoMessageForm.isActive}
                        onCheckedChange={(checked) => setAutoMessageForm({ ...autoMessageForm, isActive: checked })}
                      />
                      <Label>Active</Label>
                    </div>

                    <Button onClick={handleSaveAutoMessage} className="bg-brand-blue hover:bg-blue-600">
                      {editingAutoMessage ? 'Update Message' : 'Create Message'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'daily-reports' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Daily Sales Report</h4>
                    <p className="text-sm text-muted-foreground">
                      Automatically send a daily summary of orders and sales
                    </p>
                  </div>
                  <Switch
                    checked={dailyReportSettings.enabled}
                    onCheckedChange={(checked) => setDailyReportSettings({ ...dailyReportSettings, enabled: checked })}
                  />
                </div>

                {dailyReportSettings.enabled && (
                  <div className="space-y-4 pl-4 border-l-2">
                    <div>
                      <Label>Send report to (comma-separated emails)</Label>
                      <Input
                        value={dailyReportSettings.emails}
                        onChange={(e) => setDailyReportSettings({ ...dailyReportSettings, emails: e.target.value })}
                        placeholder="owner@example.com, manager@example.com"
                      />
                    </div>
                    <div>
                      <Label>Send time (CST)</Label>
                      <Input
                        type="time"
                        value={dailyReportSettings.time}
                        onChange={(e) => setDailyReportSettings({ ...dailyReportSettings, time: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveDailyReportSettings}
                    disabled={isSavingDailyReport}
                    className="bg-brand-blue hover:bg-blue-600"
                  >
                    {isSavingDailyReport ? 'Saving...' : 'Save Settings'}
                  </Button>
                  {dailyReportSettings.emails && (
                    <Button
                      variant="outline"
                      onClick={handleSendTestReport}
                      disabled={isSavingDailyReport}
                    >
                      Send Test Report
                    </Button>
                  )}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'sms-management' && (
            <div className="space-y-6">
              {/* Customer SMS Opt-Out Management */}
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Customer SMS Preferences
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Search customers and manage their SMS opt-in/opt-out status. Customers are opted-in by default.
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or phone number..."
                    value={smsContactSearch}
                    onChange={(e) => setSmsContactSearch(e.target.value)}
                    className="max-w-sm"
                  />
                </div>

                <ScrollArea className="h-64 border rounded-lg">
                  {loadingContacts ? (
                    <div className="text-center py-8 text-muted-foreground">Loading contacts...</div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {(allContacts as any[])
                        .filter((c: any) => {
                          if (!smsContactSearch) return true;
                          const search = smsContactSearch.toLowerCase();
                          return (
                            c.name?.toLowerCase().includes(search) ||
                            c.phoneNumber?.includes(search)
                          );
                        })
                        .slice(0, 50)
                        .map((contact: any) => (
                          <div key={contact.id} className="flex items-center justify-between p-3 hover:bg-muted rounded-lg border">
                            <div>
                              <p className="font-medium">{contact.name}</p>
                              <p className="text-sm text-muted-foreground">{contact.phoneNumber || 'No phone'}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <Badge variant={contact.smsOptOut ? 'destructive' : 'default'}>
                                {contact.smsOptOut ? 'Opted Out' : 'Opted In'}
                              </Badge>
                              <Switch
                                checked={!contact.smsOptOut}
                                onCheckedChange={async (checked) => {
                                  try {
                                    await fetch(`/api/contacts/${contact.id}/sms-opt-out`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      credentials: 'include',
                                      body: JSON.stringify({ optOut: !checked })
                                    });
                                    queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
                                    toast({
                                      title: checked ? 'Opted In' : 'Opted Out',
                                      description: `${contact.name} ${checked ? 'will now receive' : 'will no longer receive'} SMS messages`,
                                    });
                                  } catch (error) {
                                    toast({
                                      title: 'Error',
                                      description: 'Failed to update SMS preference',
                                      variant: 'destructive'
                                    });
                                  }
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      {(allContacts as any[]).filter((c: any) => {
                        if (!smsContactSearch) return true;
                        const search = smsContactSearch.toLowerCase();
                        return c.name?.toLowerCase().includes(search) || c.phoneNumber?.includes(search);
                      }).length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          No contacts found matching "{smsContactSearch}"
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* SMS Delivery Logs */}
              <div className="border-t pt-6 space-y-4">
                <div>
                  <h4 className="font-medium flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    SMS Delivery History
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    View recent SMS messages and their delivery status
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={smsLogFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSmsLogFilter('all')}
                  >
                    All Messages
                  </Button>
                  <Button
                    variant={smsLogFilter === 'failed' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSmsLogFilter('failed')}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Failed
                  </Button>
                  <Button
                    variant={smsLogFilter === 'skipped' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSmsLogFilter('skipped')}
                  >
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    Skipped (Opt-out)
                  </Button>
                </div>

                <ScrollArea className="h-72 border rounded-lg">
                  {loadingSmsLogs ? (
                    <div className="text-center py-8 text-muted-foreground">Loading SMS logs...</div>
                  ) : (
                    <div className="p-2 space-y-2">
                      {(smsLogs as any[])
                        .filter((log: any) => {
                          if (smsLogFilter === 'all') return true;
                          return log.status === smsLogFilter;
                        })
                        .slice(0, 100)
                        .map((log: any) => (
                          <div key={log.id} className="p-3 border rounded-lg text-sm">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant={
                                    log.status === 'sent' ? 'default' :
                                    log.status === 'failed' ? 'destructive' :
                                    'secondary'
                                  }>
                                    {log.status === 'sent' && <CheckCircle className="w-3 h-3 mr-1" />}
                                    {log.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                                    {log.status === 'skipped' && <AlertTriangle className="w-3 h-3 mr-1" />}
                                    {log.status}
                                  </Badge>
                                  <span className="text-muted-foreground">{log.phoneNumber}</span>
                                </div>
                                <p className="text-muted-foreground truncate">{log.message}</p>
                                {log.errorMessage && (
                                  <p className="text-destructive text-xs mt-1">{log.errorMessage}</p>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground whitespace-nowrap">
                                {log.sentAt ? new Date(log.sentAt).toLocaleString() : 'Unknown'}
                              </div>
                            </div>
                          </div>
                        ))}
                      {(smsLogs as any[]).filter((log: any) => smsLogFilter === 'all' || log.status === smsLogFilter).length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          {smsLogFilter === 'all' ? 'No SMS messages sent yet' : `No ${smsLogFilter} messages`}
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}

          {(activeTab === 'email' || activeTab === 'sms') && (
            <>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Target Audience</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={allRolesSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setRoleFilters(new Set(['customers', 'groomers', 'admins']));
                  setSelectedRecipients([]);
                }}
              >
                All ({getRoleCount('all')})
              </Button>
              {(['customers', 'groomers', 'admins'] as const).map((role) => (
                <Button
                  key={role}
                  variant={roleFilters.has(role) && !allRolesSelected ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setRoleFilters(prev => {
                      const next = new Set(prev);
                      if (next.has(role)) {
                        if (next.size > 1) next.delete(role);
                      } else {
                        next.add(role);
                      }
                      return next;
                    });
                    setSelectedRecipients([]);
                  }}
                >
                  {role.charAt(0).toUpperCase() + role.slice(1)} ({getRoleCount(role)})
                </Button>
              ))}
            </div>
            {!allRolesSelected && (
              <p className="text-xs text-muted-foreground">
                Sending to: {Array.from(roleFilters).map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(' + ')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Quick Templates</Label>
            <div className="flex flex-wrap gap-2">
              {activeTab === 'email' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSubject('Important Notice from Animal House Pet Store');
                      setMessage('Dear Valued Customer,\n\nWe have an important update to share with you.\n\n[Your message here]\n\nThank you for being a loyal customer!\n\nBest regards,\nAnimal House Pet Store');
                    }}
                  >
                    General Announcement
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSubject('Special Offer Just for You!');
                      setMessage('Dear Valued Customer,\n\nWe have an exclusive offer waiting for you at Animal House Pet Store!\n\n[Describe your offer here]\n\nVisit us today!\n\nBest regards,\nAnimal House Pet Store');
                    }}
                  >
                    Promotional
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSubject('Reminder: Your Appointment at Animal House');
                      setMessage('Dear Customer,\n\nThis is a friendly reminder about your upcoming appointment.\n\n[Add appointment details]\n\nWe look forward to seeing you!\n\nBest regards,\nAnimal House Pet Store');
                    }}
                  >
                    Appointment Reminder
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMessage('Hi from Animal House! Your appointment is tomorrow. Reply CONFIRM to confirm. Questions? Call us!')}
                  >
                    Appointment Reminder
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMessage('Animal House special! Visit us today for exclusive deals on pet supplies!')}
                  >
                    Promotional
                  </Button>
                </>
              )}
            </div>
          </div>

          {activeTab === 'email' && (
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject..."
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="message-body">{activeTab === 'email' ? 'Message' : 'Text Message'}</Label>
            <Textarea
              id="message-body"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={activeTab === 'email' ? "Enter your message..." : "Enter text message (160 chars recommended)..."}
              rows={activeTab === 'email' ? 8 : 4}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Recipients</Label>
              <div className="flex gap-2">
                <Button
                  variant={sendToAll ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSendToAll(true);
                    setSelectedRecipients([]);
                  }}
                >
                  All {!allRolesSelected ? Array.from(roleFilters).join(' & ') : 'users'} ({activeTab === 'sms' ? recipientsWithPhones.length : filteredRecipients.length})
                </Button>
                <Button
                  variant={!sendToAll ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSendToAll(false)}
                >
                  Pick Individually
                </Button>
              </div>
            </div>

            {!sendToAll && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={activeTab === 'sms' ? "Search by name or phone..." : "Search by name or email..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={clearAll}>Clear</Button>
                </div>

                <ScrollArea className="h-52 border rounded-lg p-2">
                  {loadingRecipients ? (
                    <div className="text-center py-4 text-muted-foreground">Loading...</div>
                  ) : (activeTab === 'sms' ? recipientsWithPhones : filteredRecipients).length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">No matching recipients</div>
                  ) : (
                    <div className="space-y-1">
                      {(activeTab === 'sms' ? recipientsWithPhones : filteredRecipients).map((recipient: any) => (
                        <div key={recipient.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer" onClick={() => toggleRecipient(recipient.id)}>
                          <Checkbox
                            checked={selectedRecipients.includes(String(recipient.id))}
                            onCheckedChange={() => toggleRecipient(recipient.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{recipient.fullName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {activeTab === 'sms' ? recipient.phoneNumber : recipient.email}
                            </p>
                          </div>
                          {recipient.isGroomer && <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">Groomer</span>}
                          {recipient.isAdmin && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">Admin</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <p className="text-sm text-muted-foreground">
                  {selectedRecipients.length} of {(activeTab === 'sms' ? recipientsWithPhones : filteredRecipients).length} selected
                </p>
              </div>
            )}
          </div>

          {activeTab === 'email' && (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
              <Checkbox
                id="is-marketing"
                checked={isMarketing}
                onCheckedChange={(checked) => setIsMarketing(checked as boolean)}
              />
              <div>
                <Label htmlFor="is-marketing" className="text-sm font-medium cursor-pointer">
                  This is a marketing email
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {isMarketing 
                    ? "Users who opted out of marketing emails will NOT receive this." 
                    : "Leave unchecked for important updates (app changes, store notices) — these go to everyone."}
                </p>
              </div>
            </div>
          )}

          <Button
            className="w-full bg-brand-blue hover:bg-blue-600"
            onClick={activeTab === 'email' ? handleSendEmail : handleSendSMS}
            disabled={isSending || !message.trim() || (activeTab === 'email' && !subject.trim())}
          >
            {isSending ? (
              <>
                <Send className="w-4 h-4 mr-2 animate-pulse" />
                {activeTab === 'email' ? 'Sending Emails...' : 'Sending Text Messages...'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {activeTab === 'email' 
                  ? `Send Email${sendToAll ? ` to ${filteredRecipients.length} ${allRolesSelected ? 'users' : Array.from(roleFilters).join(' & ')}` : ` to ${selectedRecipients.length} selected`}`
                  : `Send Text${sendToAll ? ` to ${recipientsWithPhones.length} users with phones` : ` to ${selectedRecipients.length} selected`}`}
              </>
            )}
          </Button>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

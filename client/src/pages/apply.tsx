import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, ChevronLeft } from "lucide-react";
import { Link } from "wouter";

const employmentHistorySchema = z.object({
  employer: z.string(),
  address: z.string(),
  phone: z.string(),
  supervisor: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  position: z.string(),
  startingSalary: z.string(),
  endingSalary: z.string(),
  reasonForLeaving: z.string(),
  mayWeContact: z.boolean(),
});

const referenceSchema = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  relationship: z.string(),
});

const formSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  middleName: z.string().optional(),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(1, "ZIP is required"),
  phone: z.string().min(7, "Phone is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  isOver18: z.boolean().refine(v => v === true, "You must be 18 or older"),
  positionApplied: z.string().min(1, "Position is required"),
  dateAvailable: z.string().min(1, "Date available is required"),
  desiredPay: z.string().optional(),
  employmentType: z.string().min(1, "Employment type is required"),
  workedHereBefore: z.boolean().default(false),
  workedHereBeforeDetails: z.string().optional(),
  employmentHistory: z.array(employmentHistorySchema),
  highSchoolName: z.string().optional(),
  highSchoolCity: z.string().optional(),
  highSchoolGraduated: z.boolean().optional(),
  highSchoolDegree: z.string().optional(),
  collegeName: z.string().optional(),
  collegeCity: z.string().optional(),
  collegeGraduated: z.boolean().optional(),
  collegeDegree: z.string().optional(),
  references: z.array(referenceSchema),
  availabilityDays: z.array(z.string()).default([]),
  availabilityNotes: z.string().optional(),
  eligibleToWork: z.boolean().refine(v => v === true, "You must be eligible to work in the US"),
  convictedOfFelony: z.boolean().default(false),
  felonyDetails: z.string().optional(),
  isVeteran: z.boolean().default(false),
  additionalInfo: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const emptyJob = {
  employer: "", address: "", phone: "", supervisor: "",
  startDate: "", endDate: "", position: "",
  startingSalary: "", endingSalary: "", reasonForLeaving: "", mayWeContact: true,
};

const emptyRef = { name: "", address: "", phone: "", relationship: "" };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const SECTION = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <div className="bg-gray-800 text-white px-4 py-2 text-sm font-bold uppercase tracking-wide rounded-t">
      {title}
    </div>
    <div className="border border-t-0 border-gray-300 rounded-b p-4 space-y-4">
      {children}
    </div>
  </div>
);

export default function Apply() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "", lastName: "", middleName: "",
      address: "", city: "", state: "Louisiana", zip: "",
      phone: "", email: "", isOver18: false,
      positionApplied: "", dateAvailable: "", desiredPay: "",
      employmentType: "", workedHereBefore: false, workedHereBeforeDetails: "",
      employmentHistory: [emptyJob, emptyJob, emptyJob],
      highSchoolName: "", highSchoolCity: "",
      highSchoolGraduated: false, highSchoolDegree: "",
      collegeName: "", collegeCity: "",
      collegeGraduated: false, collegeDegree: "",
      references: [emptyRef, emptyRef, emptyRef],
      availabilityDays: [], availabilityNotes: "",
      eligibleToWork: false, convictedOfFelony: false,
      felonyDetails: "", isVeteran: false, additionalInfo: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await apiRequest("POST", "/api/job-applications", data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Submission failed");
      }
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h1>
          <p className="text-gray-600 mb-6">
            Thank you for applying to The Animal House. We review all applications and will be in touch if your qualifications match our needs.
          </p>
          <Link href="/">
            <Button className="bg-gray-800 hover:bg-gray-700">Back to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gray-800 text-white py-6 px-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/" className="inline-flex items-center text-gray-300 hover:text-white text-sm mb-4">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Link>
          <h1 className="text-2xl font-bold">Employment Application</h1>
          <p className="text-gray-300 text-sm mt-1">The Animal House — West Monroe, Louisiana</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border border-gray-200 text-sm text-gray-600">
          <p>
            The Animal House is an equal opportunity employer. All applicants are considered for
            employment without regard to race, color, religion, sex, national origin, age, disability,
            or veteran status. Please fill out this application completely and accurately.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => submitMutation.mutate(d))} className="space-y-0">

            {/* ── Personal Information ── */}
            <SECTION title="Personal Information">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="middleName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Middle Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address <span className="text-red-500">*</span></FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem className="col-span-1">
                    <FormLabel>City <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="state" render={({ field }) => (
                  <FormItem>
                    <FormLabel>State <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="zip" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input {...field} type="tel" placeholder="(318) 000-0000" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input {...field} type="email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="isOver18" render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0 cursor-pointer">
                    I am 18 years of age or older <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormMessage />
                </FormItem>
              )} />
            </SECTION>

            {/* ── Position Desired ── */}
            <SECTION title="Position Desired">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="positionApplied" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position Applied For <span className="text-red-500">*</span></FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Groomer">Groomer</SelectItem>
                        <SelectItem value="Groomer's Assistant / Bather">Groomer's Assistant / Bather</SelectItem>
                        <SelectItem value="Retail Sales Associate">Retail Sales Associate</SelectItem>
                        <SelectItem value="Kennel Technician">Kennel Technician</SelectItem>
                        <SelectItem value="Cashier">Cashier</SelectItem>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dateAvailable" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date Available to Start <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input {...field} type="date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="desiredPay" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desired Pay Rate</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. $15/hr or Open" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="employmentType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employment Type <span className="text-red-500">*</span></FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Full-Time">Full-Time</SelectItem>
                        <SelectItem value="Part-Time">Part-Time</SelectItem>
                        <SelectItem value="Either">Either Full or Part-Time</SelectItem>
                        <SelectItem value="Temporary">Temporary / Seasonal</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="workedHereBefore" render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0 cursor-pointer">Have you previously worked at The Animal House?</FormLabel>
                </FormItem>
              )} />
              {form.watch("workedHereBefore") && (
                <FormField control={form.control} name="workedHereBeforeDetails" render={({ field }) => (
                  <FormItem>
                    <FormLabel>If yes, when and what position?</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )} />
              )}
            </SECTION>

            {/* ── Availability ── */}
            <SECTION title="Availability">
              <FormField control={form.control} name="availabilityDays" render={({ field }) => (
                <FormItem>
                  <FormLabel>Days Available to Work</FormLabel>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {DAYS.map(day => (
                      <label key={day} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={field.value?.includes(day)}
                          onCheckedChange={checked => {
                            const current = field.value || [];
                            field.onChange(checked ? [...current, day] : current.filter(d => d !== day));
                          }}
                        />
                        <span className="text-sm">{day}</span>
                      </label>
                    ))}
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="availabilityNotes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hours / Additional Availability Notes</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Available 8am–5pm Mon–Fri" /></FormControl>
                </FormItem>
              )} />
            </SECTION>

            {/* ── Employment History ── */}
            <SECTION title="Employment History (Start with most recent)">
              <p className="text-xs text-gray-500">List your last three employers. You may leave sections blank if not applicable.</p>
              {[0, 1, 2].map(i => (
                <div key={i} className="border border-gray-200 rounded p-3 space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Employer {i + 1}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name={`employmentHistory.${i}.employer`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employer / Company Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`employmentHistory.${i}.phone`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl><Input {...field} type="tel" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name={`employmentHistory.${i}.address`} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name={`employmentHistory.${i}.supervisor`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supervisor Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`employmentHistory.${i}.position`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position / Title</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name={`employmentHistory.${i}.startDate`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date Started</FormLabel>
                        <FormControl><Input {...field} placeholder="MM/YYYY" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`employmentHistory.${i}.endDate`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date Left</FormLabel>
                        <FormControl><Input {...field} placeholder="MM/YYYY or Present" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name={`employmentHistory.${i}.startingSalary`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Starting Pay</FormLabel>
                        <FormControl><Input {...field} placeholder="$" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`employmentHistory.${i}.endingSalary`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ending Pay</FormLabel>
                        <FormControl><Input {...field} placeholder="$" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name={`employmentHistory.${i}.reasonForLeaving`} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason for Leaving</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name={`employmentHistory.${i}.mayWeContact`} render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0 cursor-pointer">May we contact this employer?</FormLabel>
                    </FormItem>
                  )} />
                </div>
              ))}
            </SECTION>

            {/* ── Education ── */}
            <SECTION title="Education">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">High School</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="highSchoolName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>School Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="highSchoolCity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>City, State</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <FormField control={form.control} name="highSchoolDegree" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Diploma / GED</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. High School Diploma" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="highSchoolGraduated" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 pt-6">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0 cursor-pointer">Graduated</FormLabel>
                    </FormItem>
                  )} />
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">College / Vocational / Trade School</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="collegeName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>School Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="collegeCity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>City, State</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <FormField control={form.control} name="collegeDegree" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Degree / Certificate</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="collegeGraduated" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 pt-6">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0 cursor-pointer">Graduated / Completed</FormLabel>
                    </FormItem>
                  )} />
                </div>
              </div>
            </SECTION>

            {/* ── References ── */}
            <SECTION title="References (Do not list relatives or former employers)">
              {[0, 1, 2].map(i => (
                <div key={i} className="border border-gray-200 rounded p-3 space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Reference {i + 1}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name={`references.${i}.name`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`references.${i}.relationship`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Relationship</FormLabel>
                        <FormControl><Input {...field} placeholder="e.g. Former Coworker" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name={`references.${i}.phone`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl><Input {...field} type="tel" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`references.${i}.address`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address / City</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>
              ))}
            </SECTION>

            {/* ── Legal Questions ── */}
            <SECTION title="Legal Questions">
              <FormField control={form.control} name="eligibleToWork" render={({ field }) => (
                <FormItem className="flex items-start gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                  </FormControl>
                  <div>
                    <FormLabel className="!mt-0 cursor-pointer">
                      I am legally authorized to work in the United States <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="convictedOfFelony" render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0 cursor-pointer">
                    Have you ever been convicted of a felony?
                  </FormLabel>
                </FormItem>
              )} />
              {form.watch("convictedOfFelony") && (
                <FormField control={form.control} name="felonyDetails" render={({ field }) => (
                  <FormItem>
                    <FormLabel>If yes, please explain (a conviction does not automatically disqualify you)</FormLabel>
                    <FormControl><Textarea {...field} rows={3} /></FormControl>
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="isVeteran" render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0 cursor-pointer">Are you a United States military veteran?</FormLabel>
                </FormItem>
              )} />
            </SECTION>

            {/* ── Additional Information ── */}
            <SECTION title="Additional Information">
              <FormField control={form.control} name="additionalInfo" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Please share any additional skills, certifications, or information relevant to your application
                  </FormLabel>
                  <FormControl><Textarea {...field} rows={4} placeholder="e.g. Certified groomer, bilingual, experience with exotic animals..." /></FormControl>
                </FormItem>
              )} />
            </SECTION>

            {/* ── Certification ── */}
            <SECTION title="Applicant Certification">
              <div className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-4 rounded border">
                <p>
                  I certify that all information provided in this application is true and complete to the best of my
                  knowledge. I understand that any false information or omissions may disqualify me from further
                  consideration for employment and may result in my dismissal if discovered at a later date.
                </p>
                <p className="mt-2">
                  I authorize The Animal House to contact my former employers and references and to verify all
                  information provided in this application. I understand that employment is contingent upon
                  satisfactory results from any background or reference checks required.
                </p>
                <p className="mt-2">
                  Louisiana law requires all employers to verify employment eligibility. I understand that
                  proof of identity and work authorization will be required upon hire.
                </p>
              </div>
              <p className="text-xs text-gray-500">
                By submitting this application, I agree to and certify the statements above.
              </p>
            </SECTION>

            <Button
              type="submit"
              className="w-full bg-gray-800 hover:bg-gray-700 text-white py-3 text-base font-semibold"
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Application"}
            </Button>

          </form>
        </Form>
      </div>
    </div>
  );
}

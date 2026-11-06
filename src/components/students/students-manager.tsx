"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addStudent, moveStudent, removeStudent } from "@/app/actions/students";

export interface MessStudent { id: string; name: string | null; email: string; roll: string | null; mess: string | null }
const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** "Add student": email + name + roll number. A mess admin adds to their own mess; the warden picks the mess. */
export function AddStudentForm({ messes, fixedMess }: { messes: { id: string; name: string }[]; fixedMess?: string }) {
  const t = useTranslations("Students");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ email: "", name: "", roll: "", mess: fixedMess ?? messes[0]?.id ?? "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    start(async () => {
      const r = await addStudent(f);
      if (r.ok) { setMsg({ ok: true, text: t(r.action === "create_account" ? "addedNew" : "addedExisting") }); setF({ ...f, email: "", name: "", roll: "" }); router.refresh(); }
      else setMsg({ ok: false, text: r.error });
    });
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label={t("addTitle")} data-testid="add-student">
      <h2 className="flex items-center gap-2 font-semibold"><UserPlus className="size-4 text-primary" aria-hidden />{t("addTitle")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label htmlFor="st-email">{t("email")}</Label><Input id="st-email" type="email" required placeholder="name@student.nitw.ac.in" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><Label htmlFor="st-name">{t("name")}</Label><Input id="st-name" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label htmlFor="st-roll">{t("roll")}</Label><Input id="st-roll" required minLength={4} maxLength={15} value={f.roll} onChange={(e) => setF({ ...f, roll: e.target.value })} /></div>
        {!fixedMess && <div><Label htmlFor="st-mess">{t("mess")}</Label><select id="st-mess" className={selectCls} value={f.mess} onChange={(e) => setF({ ...f, mess: e.target.value })}>{messes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} data-testid="add-student-submit">{t("add")}</Button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"} data-testid="add-student-msg">{msg.text}</p>}
      </div>
      <p className="text-xs text-muted-foreground">{t("addHelp")}</p>
    </form>
  );
}

/** The students of the mess (admin) or of every mess (warden), with search, remove, and (warden) move. */
export function StudentsList({ students, messes, warden }: { students: MessStudent[]; messes: { id: string; name: string }[]; warden: boolean }) {
  const t = useTranslations("Students");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nameOf = (id: string | null) => messes.find((m) => m.id === id)?.name ?? t("noMess");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? students.filter((x) => [x.name, x.email, x.roll, nameOf(x.mess)].some((v) => (v ?? "").toLowerCase().includes(s))) : students;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, students]);

  const remove = (id: string) => start(async () => { const r = await removeStudent(id); setConfirm(null); setMsg(r.ok ? t("removed") : r.error); router.refresh(); });
  const move = (id: string, mess: string) => start(async () => { const r = await moveStudent(id, mess); setMsg(r.ok ? t("moved") : r.error); router.refresh(); });

  return (
    <section aria-labelledby="stu-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="stu-title" className="text-lg font-semibold">{t("listTitle", { n: students.length })}</h2>
        <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" data-testid="student-search" /></div>
      </div>
      {msg && <p role="status" className="text-sm" data-testid="students-msg">{msg}</p>}
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">{t("none")}</p> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm" data-testid="students-table">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3">{t("name")}</th><th className="p-3">{t("email")}</th><th className="p-3">{t("roll")}</th><th className="p-3">{t("mess")}</th><th className="p-3">&nbsp;</th></tr></thead>
            <tbody className="divide-y divide-border">
              {shown.map((s) => (
                <tr key={s.id} data-testid="student-row" data-email={s.email}>
                  <td className="p-3 font-medium">{s.name ?? "—"}</td><td className="p-3">{s.email}</td><td className="p-3">{s.roll ?? "—"}</td>
                  <td className="p-3">{warden ? (
                    <select aria-label={t("moveTo", { name: s.name ?? s.email })} className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={s.mess ?? ""} disabled={pending} data-testid="move-select"
                      onChange={(e) => e.target.value && move(s.id, e.target.value)}>
                      <option value="" disabled>{t("noMess")}</option>{messes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>) : nameOf(s.mess)}</td>
                  <td className="p-3 text-right">
                    {s.mess && (confirm === s.id ? (
                      <span className="inline-flex gap-1"><Button size="sm" variant="destructive" disabled={pending} onClick={() => remove(s.id)} data-testid="confirm-remove">{t("confirmRemove")}</Button><Button size="sm" variant="outline" onClick={() => setConfirm(null)}>{t("cancel")}</Button></span>
                    ) : <Button size="sm" variant="outline" onClick={() => setConfirm(s.id)} data-testid="remove-student"><UserMinus className="size-4" aria-hidden />{t("remove")}</Button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

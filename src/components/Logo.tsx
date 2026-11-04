import icon from "@/assets/sondapro-icon.png.asset.json";

export const logoUrl = icon.url;

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={icon.url} alt="SondaPro" className="h-9 w-9 rounded-xl" />
      <span className={`font-display text-xl font-extrabold ${light ? "text-sidebar-accent-foreground" : "text-navy"}`}>
        Sonda<span className={light ? "text-sidebar-primary" : "text-primary"}>Pro</span>
      </span>
    </div>
  );
}

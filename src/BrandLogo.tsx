import { motion } from "motion/react";
import { Shield, Zap } from "lucide-react";

export default function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative group">
        <div className="w-12 h-12 bg-brand-ink rounded-2xl flex items-center justify-center rotate-[-4deg] group-hover:rotate-0 transition-all duration-500 shadow-[4px_4px_0px_0px_rgba(139,92,246,0.3)]">
          <Shield className="text-white w-6 h-6" />
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="absolute -right-1 -bottom-1 w-6 h-6 bg-brand-accent rounded-lg flex items-center justify-center border-2 border-white shadow-sm"
          >
            <Zap className="text-white w-3 h-3 fill-current" />
          </motion.div>
        </div>
      </div>
      <span className="font-display text-2xl font-black tracking-tighter text-brand-ink">
        beforeusersdo<span className="text-brand-accent">.</span>
      </span>
    </div>
  );
}

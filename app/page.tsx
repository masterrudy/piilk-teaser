'use client';

import { useState } from 'react';
import Image from 'next/image';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function TeaserPage() {
  const [step, setStep] = useState(1);
  const [branch, setBranch] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [textFaded, setTextFaded] = useState(false);

  // 공통 버튼 토큰 (중복 제거 + iOS 상태 고정)
  const btnDark =
    'w-full py-4 border border-zinc-500 backdrop-blur-sm text-[13px] sm:text-[14px] font-medium bg-zinc-800/60 text-white transition-colors hover:bg-zinc-800/60 active:bg-zinc-800/60 focus:bg-zinc-800/60';

  const btnDarkUpper =
    'w-full py-4 backdrop-blur-sm border border-zinc-500 text-[13px] sm:text-[14px] tracking-[0.2em] uppercase font-medium bg-zinc-800/60 text-white transition-colors hover:bg-zinc-800/60 active:bg-zinc-800/60 focus:bg-zinc-800/60';

  // ✅ "안 눌러도" 흰색 CTA가 기본 상태로 유지되도록 기본 클래스에 bg-white/text-black 포함
  const btnWhiteUpper =
    'w-full py-4 border border-white text-[13px] sm:text-[14px] tracking-[0.2em] uppercase font-semibold bg-white text-black transition-colors hover:bg-white active:bg-white focus:bg-white hover:text-black active:text-black focus:text-black disabled:opacity-70 flex items-center justify-center gap-2';

  const handleBranch = (type: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      const labelMap: Record<string, string> = {
        A: 'Yes',
        B_no: 'No',
        B_never: "I don't drink protein",
      };
      window.gtag('event', 'survey_response', {
        survey_question: 'protein_experience',
        survey_answer: labelMap[type] || type,
        survey_segment: type === 'A' ? 'A' : type === 'B_no' ? 'B' : 'C',
      });
    }

    setBranch(type);
    setStep(3);

    // 질문 텍스트 페이드 처리
    setTextFaded(false);
    setTimeout(() => setTextFaded(true), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isSubmitting) return;

    setIsSubmitting(true);

    // segment 결정
    let segment = 'C';
    if (branch === 'A') segment = 'A';
    else if (branch === 'B_no') segment = 'B';
    else if (branch === 'B_never') segment = 'C';

    // sub_reason 결정
    let subReason = '';
    if (branch === 'A' && selectedReason) {
      if (selectedReason.includes('left something behind')) subReason = 'residue';
      else if (selectedReason.includes('aftertaste')) subReason = 'aftertaste';
      else if (selectedReason.includes('heavy')) subReason = 'heaviness';
      else if (selectedReason.includes('effort')) subReason = 'habit';
      else if (selectedReason.includes('stopped')) subReason = 'lapsed';
    } else if (branch === 'B_no') {
      subReason = 'not_interested';
    } else if (branch === 'B_never') {
      subReason = 'curious';
    }

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          segment,
          answers: { sub_reason: subReason },
        }),
      });

      const data = await response.json();

      if (data.success) setStep(4);
      else alert(data.error || 'Something went wrong. Please try again.');
    } catch (error) {
      console.error('Error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAll = () => {
    setStep(1);
    setBranch(null);
    setEmail('');
    setSelectedReason('');
    setTextFaded(false);
  };

  const Spinner = () => (
    <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );

  return (
    <main className="fixed inset-0 bg-black text-white overflow-hidden">
      {/* 배경 */}
      <div className="absolute inset-0">
        <Image
          src="/hero-bg.png"
          alt="Background"
          fill
          className="object-cover scale-110"
          style={{ objectPosition: 'center 35%' }}
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/25" />
      </div>

      {/* 콘텐츠 */}
      <div className="relative z-10 w-full h-full flex flex-col items-center">
        <div className="w-full max-w-md flex flex-col h-full px-5">
          {/* 로고 */}
          <header className="pt-5 pb-2 flex-shrink-0">
            <Image
              src="/pillk-logo.png"
              alt="Piilk"
              width={80}
              height={32}
              className="mx-auto cursor-pointer hover:opacity-70 transition-all duration-500"
              onClick={resetAll}
            />
          </header>

          <div className="flex-1 flex flex-col justify-end pb-6">
            {/* Step 1 */}
            {step === 1 && (
              <section className="animate-fadeIn">
                <div className="text-center mb-5">
                  <h1 className="text-[30px] sm:text-[38px] font-extrabold leading-[1.0] mb-3 tracking-tight">
                    EVER HAD
                    <br />
                    A DRINK
                    <br />
                    THAT FELT OFF
                    <br />
                    RIGHT AFTER?
                  </h1>
                  <p className="text-[15px] sm:text-[17px] text-zinc-300 font-light">
                    Nothing after. <span className="text-white font-normal">Period.</span>
                  </p>
                </div>

                <button onClick={() => setStep(2)} className={btnDarkUpper}>
                  Get in line
                </button>

                <p className="text-center text-[10px] tracking-[0.2em] text-zinc-400 uppercase mt-3 font-medium">
                  Early access. Invite first.
                </p>
                <p className="text-center text-[9px] tracking-[0.25em] text-zinc-500 uppercase mt-1 font-medium">
                  NYC 2026
                </p>
              </section>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <section className="animate-fadeIn">
                <div className="text-center mb-6">
                  <p className="text-[22px] sm:text-[26px] font-light leading-[1.2] text-zinc-200 italic">
                    Ever had a protein drink
                    <br />
                    that left something behind?
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    { label: 'Yes', value: 'A' },
                    { label: 'No', value: 'B_no' },
                    { label: "I don't drink protein", value: 'B_never' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleBranch(option.value)}
                      className={`${btnDark} tracking-[0.15em]`} 
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <p className="text-center text-[9px] tracking-[0.25em] text-zinc-500 uppercase mt-5 font-medium">
                  NYC 2026
                </p>
              </section>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <section className="animate-fadeIn">
                {/* 상단 질문 페이드 */}
                <div className="text-center mb-4">
                  <p
                    className={`text-[18px] sm:text-[22px] font-light leading-[1.2] italic transition-all duration-[5000ms] ease-out ${
                      textFaded ? 'text-zinc-600 opacity-40' : 'text-white opacity-100'
                    }`}
                  >
                    Ever had a protein drink
                    <br />
                    that left something behind?
                  </p>
                </div>

                <div className="border-t border-zinc-700 pt-5">
                  {/* A */}
                  {branch === 'A' && (
                    <div className="text-center mb-4">
                      <h2 className="text-[24px] sm:text-[30px] font-light mb-1 leading-[1.1]">
                        Protein. Nothing after.
                      </h2>
                      <p className="text-zinc-300 text-[14px]">Nothing left behind.</p>

                      <div className="mt-4 text-left">
                        <label className="block text-[10px] text-zinc-400 tracking-[0.2em] uppercase mb-2 font-medium">
                          What did it leave behind?
                        </label>
                        <select
                          value={selectedReason}
                          onChange={(e) => setSelectedReason(e.target.value)}
                          className="w-full p-4 bg-zinc-800/60 backdrop-blur-sm border border-zinc-500 text-white text-[16px] appearance-none focus:outline-none focus:border-zinc-400 transition-all"
                        >
                          <option value="" disabled className="bg-zinc-900">
                            Select one
                          </option>
                          <option value="It left something behind" className="bg-zinc-900">
                            It left something behind.
                          </option>
                          <option value="The aftertaste stayed too long" className="bg-zinc-900">
                            The aftertaste stayed too long.
                          </option>
                          <option value="It felt heavy" className="bg-zinc-900">
                            It felt heavy.
                          </option>
                          <option value="Keeping it up felt like effort" className="bg-zinc-900">
                            Keeping it up felt like effort.
                          </option>
                          <option value="I just stopped, no clear reason" className="bg-zinc-900">
                            I just stopped, no clear reason.
                          </option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* B_no */}
                  {branch === 'B_no' && (
                    <div className="text-center mb-4">
                      <h2 className="text-[24px] sm:text-[30px] font-light mb-1 leading-[1.1]">
                        Maybe you just
                        <br />
                        haven&apos;t noticed yet.
                      </h2>
                      <p className="text-zinc-300 text-[14px]">Protein. Nothing after.</p>
                    </div>
                  )}

                  {/* B_never */}
                  {branch === 'B_never' && (
                    <div className="text-center mb-4">
                      <h2 className="text-[24px] sm:text-[30px] font-light mb-1 leading-[1.1]">
                        Good.
                        <br />
                        You get to start clean.
                      </h2>
                      <p className="text-zinc-300 text-[14px]">Protein. Nothing after.</p>
                    </div>
                  )}

                  {/* 이메일 폼 */}
                  <form onSubmit={handleSubmit} className="space-y-3 mt-4">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full p-4 bg-zinc-800/60 backdrop-blur-sm border border-zinc-500 text-white text-[16px] placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-all"
                      required
                    />

                    {/* ✅ 기본 상태부터 흰색 CTA */}
                    <button type="submit" disabled={isSubmitting} className={btnWhiteUpper}>
                      {isSubmitting ? (
                        <>
                          <Spinner />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        'Get early access'
                      )}
                    </button>
                  </form>
                </div>

                <p className="text-center text-[9px] tracking-[0.25em] text-zinc-500 uppercase mt-4 font-medium">
                  NYC 2026
                </p>
              </section>
            )}

            {/* Step 4 */}
            {step === 4 && (
              <section className="animate-fadeIn">
                <div className="text-center py-8">
                  <div className="w-14 h-14 border-2 border-zinc-500 rounded-full flex items-center justify-center mx-auto mb-5 animate-pulse">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>

                  <p className="text-[11px] tracking-[0.25em] uppercase text-zinc-400 mb-5 font-medium">
                    You&apos;re on the list
                  </p>

                  <Image src="/pillk-logo.png" alt="Piilk" width={90} height={36} className="mx-auto mb-4" />

                  <p className="text-[16px] sm:text-[18px] text-zinc-300 font-light">
                    Nothing after. <span className="text-white font-normal">Period.</span>
                  </p>
                </div>

    <p className="text-center text-[9px] tracking-[0.25em] text-zinc-500 uppercase mt-2 font-medium">
  PIILK™ by ARMORED FRESH
</p>
<p className="text-center text-[9px] tracking-[0.15em] text-zinc-500 mt-1 font-medium">
  RTD High Protein Shake.
</p>
              </section>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
      `}</style>
    </main>
  );
}

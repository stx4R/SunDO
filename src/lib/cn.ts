import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/* tailwind-merge 기본 설정은 자체 내장 스케일만 안다. @theme의 커스텀 스케일을
   등록하지 않으면 `text-h1`이 글꼴 크기인지 색인지 판별하지 못해 `text-sundo-900`과
   같은 그룹으로 보고 뒤엣것만 남긴다(W-02 보고서 §4.4·§6-1의 확인된 결함).
   override가 아니라 extend다. Tailwind 내장 스케일을 잃으면 안 된다. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'h1',
            'h2',
            /* W-06에서 @theme에 추가한 뒤 여기 등록이 빠져 있었다(W-07 §5-6).
               등록하지 않으면 tailwind-merge가 `text-brand`를 **색**으로 보고
               `text-sundo-900`과 같은 그룹으로 묶어 뒤엣것만 남긴다. */
            'brand',
            'subtitle',
            'sheet',
            'grade',
            'classno',
            'stat',
            'body',
            'button',
            'row',
            /* W-15B 결정 3 ① — `--text-rowsm`(14px)을 §7.2 스케일로 편입하면서
               같은 회차에 등록했다. `--text-row`(14.5px)와 **다른 값**이다. */
            'rowsm',
            'label',
            'caption',
            'micro',
            'dock',
          ],
        },
      ],
      rounded: [
        {
          rounded: [
            'pill',
            '28',
            '26',
            '24',
            '22',
            '20',
            '18',
            '16',
            '15',
            '14',
            '12',
            '11',
          ],
        },
      ],
      /* shadow-glass/primary/neu는 기본 설정에서 그림자 "색"으로 오인될 수 있다. */
      shadow: [{ shadow: ['glass', 'primary', 'neu'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

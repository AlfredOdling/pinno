import * as dotenv from 'dotenv'
import OpenAI from 'openai'

import { zodResponseFormat } from 'openai/helpers/zod'
import { NewVendor } from '../types'
import { createClient } from '@supabase/supabase-js'
import { Database } from '../../types/supabase'

dotenv.config()

const supabase = createClient<Database>(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const addNewVendor = async (vendorName: string) => {
  const completion2 = await openai.beta.chat.completions.parse({
    model: 'gpt-4o-2024-08-06',
    messages: [
      {
        role: 'system',
        content:
          'You are a professional data analyst, that knows everything about the B2B SaaS market. ' +
          'You are given a name of a SaaS app. Fetch data about the app.',
      },
      {
        role: 'user',
        content: vendorName,
      },
    ],
    response_format: zodResponseFormat(NewVendor, 'newVendor'),
  })

  const vendor_ = completion2.choices[0].message.parsed.children

  const vendor = await supabase
    .from('vendor')
    .upsert(
      {
        name: vendor_.name,
        description: vendor_.description,
        url: vendor_.url,
        root_domain: vendor_.root_domain,
        logo_url: vendor_.logo_url,
        category: vendor_.category,
        link_to_pricing_page: vendor_.link_to_pricing_page,
      },
      {
        onConflict: 'root_domain',
        ignoreDuplicates: true,
      }
    )
    .select('*')
    .single()

  return vendor
}